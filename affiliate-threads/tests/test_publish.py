import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location("affiliate_publish", pathlib.Path(__file__).resolve().parents[1] / "scripts" / "publish.py")
P = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(P)


class FakeThreads:
    def __init__(self, profile=None, uncertain=False):
        self.profile = profile or {"username": "daily.picknotes", "id": "123456789"}
        self.uncertain = uncertain
        self.calls = []

    def call(self, method, path, **params):
        self.calls.append((method, path, params))
        if method == "GET":
            return self.profile
        if path.endswith("/threads_publish"):
            if self.uncertain:
                raise RuntimeError("Connection lost after server may have published")
            return {"id": "published-post"}
        return {"id": "container"}


class PublishingBoundaries(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = pathlib.Path(self.tmp.name) / "state.json"
        self.config = {"username": "daily.picknotes", "user_id": "123456789", "enabled": True, "channel": "threads_only"}
        self.post = {"status": "scheduled", "body": "책상 깊이와 정리함의 실측 크기를 먼저 비교해 보세요.",
                     "affiliate_url": "https://link.coupang.com/a/unit-test-only",
                     "source_url": "https://www.coupang.com/vp/products/example",
                     "verified_at": "2026-10-25T17:00:00+09:00"}
        self.env = mock.patch.dict(P.os.environ, {"COUPANG_THREADS_ENABLED": "true", "COUPANG_GIT_CHECKPOINT": "false"})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def run_post(self, client=None, **options):
        return P.publish(self.config, self.post, self.path, client or FakeThreads(), sleep=lambda _: None, **options)

    def test_old_brand_token_cannot_send_any_post(self):
        client = FakeThreads({"username": "heo.boram", "id": "111"})
        with self.assertRaises(ValueError):
            self.run_post(client)
        self.assertEqual([c[0] for c in client.calls], ["GET"])
        self.assertFalse(self.path.exists())

    def test_matching_handle_with_wrong_user_id_is_rejected(self):
        client = FakeThreads({"username": "daily.picknotes", "id": "different-id"})
        with self.assertRaises(ValueError):
            self.run_post(client)
        self.assertFalse(any(c[0] == "POST" for c in client.calls))

    def test_known_brand_is_rejected_even_if_config_was_changed(self):
        self.config["username"] = "bruce.insight"
        client = FakeThreads({"username": "bruce.insight", "id": "123456789"})
        with self.assertRaises(ValueError):
            self.run_post(client)
        self.assertFalse(any(c[0] == "POST" for c in client.calls))

    def test_disclosure_and_link_are_in_the_same_top_level_post(self):
        client = FakeThreads()
        self.run_post(client)
        sent = next(c[2]["text"] for c in client.calls if "text" in c[2])
        self.assertTrue(sent.startswith(P.DISCLOSURE + "\n\n"))
        self.assertTrue(sent.endswith(self.post["affiliate_url"]))
        self.assertEqual(sum(c[1].endswith("/threads") for c in client.calls), 1)

    def test_success_is_not_republished(self):
        self.run_post()
        client = FakeThreads()
        self.run_post(client)
        self.assertFalse(any(c[0] == "POST" for c in client.calls))

    def test_uncertain_publish_cannot_be_automatically_retried(self):
        with self.assertRaises(RuntimeError):
            self.run_post(FakeThreads(uncertain=True))
        self.assertEqual(json.loads(self.path.read_text())["stage"], "needs_review")
        client = FakeThreads()
        with self.assertRaises(ValueError):
            self.run_post(client)
        self.assertFalse(any(c[0] == "POST" for c in client.calls))

    def test_failed_durable_checkpoint_stops_before_external_mutation(self):
        client = FakeThreads()
        def fail_save(*_):
            raise RuntimeError("Git push denied")
        with self.assertRaises(RuntimeError):
            self.run_post(client, save=fail_save)
        self.assertFalse(any(c[0] == "POST" for c in client.calls))

    def test_content_cannot_be_changed_during_recovery(self):
        with self.assertRaises(RuntimeError):
            self.run_post(FakeThreads(uncertain=True))
        self.post["body"] = "수정한 상품 설명"
        client = FakeThreads()
        with self.assertRaises(ValueError):
            self.run_post(client)
        self.assertFalse(any(c[0] == "POST" for c in client.calls))

    def test_disabled_account_never_makes_an_api_call(self):
        self.config["enabled"] = False
        client = FakeThreads()
        with self.assertRaises(ValueError):
            self.run_post(client)
        self.assertEqual(client.calls, [])

    def test_invalid_and_oversize_posts_fail_before_api(self):
        for changes in [{"affiliate_url": "https://link.coupang.com.attacker.example/a/1"},
                        {"affiliate_url": "https://www.coupang.com/vp/products/1"},
                        {"body": "물건 " * 200}, {"source_url": ""},
                        {"body": "설명 https://example.com"}]:
            with self.subTest(changes=changes):
                self.post.update(changes)
                client = FakeThreads()
                with self.assertRaises(ValueError):
                    self.run_post(client)
                self.assertEqual(client.calls, [])
                self.setUp_post()

    def setUp_post(self):
        self.post = {"status": "scheduled", "body": "책상 깊이와 정리함 크기를 비교해 보세요.",
                     "affiliate_url": "https://link.coupang.com/a/unit-test-only",
                     "source_url": "https://www.coupang.com/vp/products/example",
                     "verified_at": "2026-10-25T17:00:00+09:00"}


class DailySlots(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        (pathlib.Path(self.tmp.name) / "posts").mkdir()
        self.root = mock.patch.object(P, "ROOT", pathlib.Path(self.tmp.name))
        self.root.start()

    def tearDown(self):
        self.root.stop()
        self.tmp.cleanup()

    def test_each_slot_has_its_own_file_and_checkpoint_name(self):
        self.assertEqual(P.post_name("2026-10-27", 1), "2026-10-27-1.json")
        self.assertEqual(P.post_name("2026-10-27", 2), "2026-10-27-2.json")
        self.assertEqual(P.post_name("2026-10-27", 3), "2026-10-27-3.json")

    def test_evening_slot_still_reads_legacy_one_a_day_file(self):
        (P.ROOT / "posts" / "2026-10-27.json").write_text("{}")
        self.assertEqual(P.post_name("2026-10-27", 3), "2026-10-27.json")
        self.assertEqual(P.post_name("2026-10-27", 1), "2026-10-27-1.json")


if __name__ == "__main__":
    unittest.main()
