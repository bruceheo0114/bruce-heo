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
    def __init__(self, profile=None, uncertain=False, fail_on_publish=None, fail_on_create=None):
        self.profile = profile or {"username": "daily.picknotes", "id": "123456789"}
        self.uncertain = uncertain
        self.fail_on_publish = fail_on_publish
        self.fail_on_create = fail_on_create
        self.calls = []
        self.published = 0
        self.created = 0

    def call(self, method, path, **params):
        self.calls.append((method, path, params))
        if method == "GET":
            return self.profile
        if path.endswith("/threads_publish"):
            self.published += 1
            if self.uncertain or self.published == self.fail_on_publish:
                raise RuntimeError("Connection lost after server may have published")
            return {"id": f"published-{params['creation_id']}"}
        self.created += 1
        if self.created == self.fail_on_create:
            raise RuntimeError("Threads API HTTP 403")
        return {"id": f"container-{len(self.calls)}"}


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

    def test_product_photo_is_sent_as_image_post(self):
        self.post["image_url"] = "https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/retail/images/x.jpg"
        client = FakeThreads()
        self.run_post(client)
        create = next(c[2] for c in client.calls if c[1].endswith("/threads"))
        self.assertEqual(create["media_type"], "IMAGE")
        self.assertEqual(create["image_url"], self.post["image_url"])

    def test_image_from_other_hosts_fails_before_api(self):
        for link in ["http://thumbnail.coupangcdn.com/x.jpg", "https://coupangcdn.com.attacker.example/x.jpg", "https://example.com/x.jpg"]:
            with self.subTest(link=link):
                self.post["image_url"] = link
                client = FakeThreads()
                with self.assertRaises(ValueError):
                    self.run_post(client)
                self.assertFalse(any(c[0] == "POST" for c in client.calls))

    def test_text_only_digest_is_unchanged_for_existing_checkpoints(self):
        self.run_post()
        expected = P.hashlib.sha256(("123456789\n" + P.compose(self.post)).encode()).hexdigest()
        self.assertEqual(json.loads(self.path.read_text())["digest"], expected)

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


class ThreadPosts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = pathlib.Path(self.tmp.name) / "state.json"
        self.config = {"username": "daily.picknotes", "user_id": "123456789", "enabled": True, "channel": "threads_only"}
        self.post = {"status": "scheduled", "text": "문풍지 사기 전에, 길이부터 재보세요.", "topic_tag": "살림팁",
                     "replies": ["방문 아래, 현관 틈까지 길이를 다 더해 보세요."],
                     "body": "이 제품은 상품 페이지에 3M 5개 구성으로 표시돼 있어요.",
                     "affiliate_url": "https://link.coupang.com/a/unit-test-only",
                     "image_url": "https://thumbnail.coupangcdn.com/x.jpg",
                     "source_url": "https://www.coupang.com/vp/products/example",
                     "verified_at": "2026-10-25T17:00:00+09:00"}
        self.env = mock.patch.dict(P.os.environ, {"COUPANG_THREADS_ENABLED": "true", "COUPANG_GIT_CHECKPOINT": "false"})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def run_post(self, client):
        return P.publish(self.config, self.post, self.path, client, sleep=lambda _: None)

    def creates(self, client):
        return [c[2] for c in client.calls if c[1].endswith("/threads")]

    def test_ad_and_link_come_last_in_one_reply_with_the_photo(self):
        client = FakeThreads()
        self.run_post(client)
        opener, middle, ad = self.creates(client)
        self.assertEqual((opener["media_type"], opener["topic_tag"]), ("TEXT", "살림팁"))
        self.assertNotIn("reply_to_id", opener)
        self.assertNotIn("link.coupang", opener["text"] + middle["text"])
        self.assertTrue(ad["text"].startswith(P.DISCLOSURE + "\n\n"))
        self.assertTrue(ad["text"].endswith(self.post["affiliate_url"]))
        self.assertEqual(ad["media_type"], "IMAGE")
        self.assertNotIn("topic_tag", middle)
        # Each reply hangs off the previous published post, so the ad is the last in the thread.
        self.assertEqual(middle["reply_to_id"], "published-container-2")
        self.assertEqual(ad["reply_to_id"], "published-container-4")
        self.assertEqual(json.loads(self.path.read_text())["stage"], "posted")

    def test_without_reply_permission_thread_becomes_one_disclosed_post(self):
        self.config["thread_replies"] = False
        client = FakeThreads()
        self.run_post(client)
        created = self.creates(client)
        self.assertEqual(len(created), 1)
        self.assertNotIn("reply_to_id", created[0])
        self.assertTrue(created[0]["text"].startswith(P.DISCLOSURE + "\n\n" + self.post["text"]))
        self.assertTrue(created[0]["text"].endswith(self.post["affiliate_url"]))
        self.assertEqual(created[0]["media_type"], "IMAGE")
        self.assertEqual(created[0]["topic_tag"], "살림팁")

    def test_links_in_opener_or_replies_are_rejected_before_api(self):
        original = dict(self.post)
        for changes in [{"text": "자세히는 https://example.com"}, {"replies": ["link.coupang.com/a/x"]}, {"topic_tag": "생활 꿀팁"}]:
            with self.subTest(changes=changes):
                self.post = dict(original, **changes)
                client = FakeThreads()
                with self.assertRaises(ValueError):
                    self.run_post(client)
                self.assertEqual(client.calls, [])

    def test_uncertain_reply_stops_and_never_reposts_the_opener(self):
        with self.assertRaises(RuntimeError):
            self.run_post(FakeThreads(fail_on_publish=2))
        state = json.loads(self.path.read_text())
        self.assertEqual([p.get("stage") for p in state["parts"]], ["posted", "needs_review", None])
        client = FakeThreads()
        with self.assertRaises(ValueError):
            self.run_post(client)
        self.assertFalse(any(c[0] == "POST" for c in client.calls))

    def test_rejected_reply_container_is_retried_without_reposting_the_opener(self):
        with self.assertRaises(RuntimeError):
            self.run_post(FakeThreads(fail_on_create=2))
        state = json.loads(self.path.read_text())
        self.assertEqual([p.get("stage") for p in state["parts"]], ["posted", "needs_review", None])
        client = FakeThreads()
        self.run_post(client)
        middle, ad = self.creates(client)
        self.assertEqual(middle["reply_to_id"], state["parts"][0]["media_id"])
        self.assertTrue(ad["text"].startswith(P.DISCLOSURE))
        self.assertEqual(json.loads(self.path.read_text())["stage"], "posted")

    def test_interrupted_run_resumes_after_the_last_posted_part(self):
        self.run_post(FakeThreads())
        state = json.loads(self.path.read_text())
        state["stage"] = "threading"
        state["parts"][2] = {}
        self.path.write_text(json.dumps(state))
        client = FakeThreads()
        self.run_post(client)
        created = self.creates(client)
        self.assertEqual(len(created), 1)
        self.assertTrue(created[0]["text"].startswith(P.DISCLOSURE))


class AutoLinks(unittest.TestCase):
    class Response:
        def __init__(self, body):
            self.body = json.dumps(body).encode()

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def read(self):
            return self.body

    def test_deeplink_request_is_signed_and_returns_the_short_link(self):
        seen = {}
        def opener(request, timeout):
            seen["auth"] = request.headers["Authorization"]
            seen["body"] = json.loads(request.data)
            return self.Response({"rCode": "0", "data": [{"shortenUrl": "https://link.coupang.com/a/abc123"}]})
        now = P.dt.datetime(2026, 10, 26, 0, 0, 5, tzinfo=P.dt.timezone.utc)
        link = P.coupang_deeplink("https://www.coupang.com/vp/products/1?itemId=2", "AK", "SK", opener=opener, now=now)
        self.assertEqual(link, "https://link.coupang.com/a/abc123")
        self.assertEqual(seen["body"], {"coupangUrls": ["https://www.coupang.com/vp/products/1?itemId=2"]})
        expected = P.hmac.new(b"SK", ("261026T000005ZPOST" + P.DEEPLINK_PATH).encode(), P.hashlib.sha256).hexdigest()
        self.assertEqual(seen["auth"], f"CEA algorithm=HmacSHA256, access-key=AK, signed-date=261026T000005Z, signature={expected}")

    def test_bad_answers_and_non_coupang_pages_never_become_links(self):
        for body in [{"rCode": "1", "data": []}, {"rCode": "0", "data": [{"shortenUrl": "https://evil.example/a/1"}]}]:
            with self.subTest(body=body), self.assertRaises(RuntimeError):
                P.coupang_deeplink("https://www.coupang.com/vp/products/1", "AK", "SK", opener=lambda *_ , **__: self.Response(body))
        with self.assertRaises(ValueError):
            P.coupang_deeplink("https://example.com/p/1", "AK", "SK", opener=None)
        with self.assertRaises(ValueError):
            P.coupang_deeplink("https://www.coupang.com/vp/products/1", "", "", opener=None)

    def test_fill_link_only_in_auto_mode_and_saves_before_publishing(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "post.json"
            post = {"status": "scheduled", "text": "기준만 쓴 첫 글", "body": "상품 설명", "affiliate_url": "",
                    "source_url": "https://www.coupang.com/vp/products/1", "verified_at": "2026-10-25T18:40:00+09:00"}
            same = P.fill_link({"auto_links": False}, dict(post), path, deeplink=lambda *_: self.fail("called"))
            self.assertEqual(same["affiliate_url"], "")
            with mock.patch.dict(P.os.environ, {"COUPANG_GIT_CHECKPOINT": "false"}):
                filled = P.fill_link({"auto_links": True}, dict(post), path, deeplink=lambda *_: "https://link.coupang.com/a/auto1")
            self.assertEqual(filled["affiliate_url"], "https://link.coupang.com/a/auto1")
            self.assertEqual(json.loads(path.read_text())["affiliate_url"], "https://link.coupang.com/a/auto1")


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
