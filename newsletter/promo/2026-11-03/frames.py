# 홍보 이미지 원본(HTML). 스토리는 인스타 상단 프로필·하단 답장 영역을 피해 위 230px·아래 260px 여백. render.cjs 가 PNG 로 찍는다. 디자인은 /newsletter/newsletter.css 와 같은 토큰.
import json, pathlib
OUT = pathlib.Path(__file__).parent / "html"
OUT.mkdir(exist_ok=True)
CSS = """
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css');
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:%(w)dpx;height:%(h)dpx;background:#F2F1ED;color:#111;font-family:'Pretendard Variable',Pretendard,'Apple SD Gothic Neo',sans-serif;word-break:keep-all;overflow:hidden}
.f{width:100%%;height:100%%;padding:%(pad)dpx;display:flex;flex-direction:column;gap:%(gap)dpx}
.top{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:18px;font-size:34px;font-weight:800;letter-spacing:-.01em}
.mark{width:64px;height:64px;border-radius:50%%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;letter-spacing:-.09em}
.mark i{font-style:normal;color:#65B98A}
.page{font-size:28px;font-weight:700;color:#73736E}
.pill{align-self:flex-start;font-size:34px;font-weight:800;color:#23744C;border:4px solid #65B98A;border-radius:999px;padding:10px 28px 12px}
h1{font-size:%(h1)dpx;line-height:1.28;font-weight:900;letter-spacing:-.04em}
h2{font-size:%(h2)dpx;line-height:1.3;font-weight:900;letter-spacing:-.035em}
p.lead{font-size:%(lead)dpx;line-height:1.55;color:#3A3A37;font-weight:500}
.grow{flex:1}
.k{font-size:30px;font-weight:800;color:#23744C}
.box{background:#E9E7E1;border-radius:32px;padding:44px 48px;display:flex;flex-direction:column;gap:18px}
.card{background:#FBFAF7;border:3px solid #65B98A;border-radius:32px;padding:44px 48px;display:flex;flex-direction:column;gap:18px}
.quote{border-left:6px solid #111;padding:4px 0 4px 32px;font-size:%(q)dpx;line-height:1.55;font-weight:700}
.cite{font-size:26px;color:#73736E;font-weight:500}
ol.list{list-style:none;border-top:2px solid #D6D3CB}
ol.list li{display:grid;grid-template-columns:80px 1fr;gap:16px;padding:24px 4px;border-bottom:2px solid #E3E1DA}
ol.list span{font-size:28px;color:#73736E;padding-top:4px}
ol.list b{display:block;font-size:%(li)dpx;font-weight:800;line-height:1.38;letter-spacing:-.02em}
ol.list small{display:block;margin-top:6px;font-size:26px;color:#73736E}
.big{font-size:%(big)dpx;font-weight:900;letter-spacing:-.05em;line-height:1;color:#111}
.big em{font-style:normal;color:#23744C}
.btn{align-self:flex-start;background:#111;color:#fff;border-radius:24px;padding:30px 44px;font-size:36px;font-weight:700}
.url{font-size:34px;font-weight:800;color:#23744C}
.foot{display:flex;justify-content:space-between;align-items:center;font-size:28px;color:#73736E;font-weight:600;border-top:2px solid #E3E1DA;padding-top:28px}
.sticker{border:4px dashed #D6D3CB;border-radius:28px;height:200px;display:flex;align-items:center;justify-content:center;font-size:30px;color:#A5A39C;font-weight:600}
.row{display:flex;gap:16px;flex-wrap:wrap}
.chip{font-size:28px;font-weight:800;color:#23744C;border:3px solid #65B98A;border-radius:999px;padding:6px 20px 8px}
"""
FEED = dict(w=1080, h=1350, pad=84, gap=40, h1=86, h2=70, lead=38, q=40, li=38, big=150)
STORY = dict(w=1080, h=1920, pad=96, gap=52, h1=96, h2=78, lead=42, q=44, li=40, big=170)
TOP = lambda n, t: f'<div class="top"><div class="brand"><span class="mark">BR<i>.</i></span>허보람(브루스)</div><span class="page">{n}/{t}</span></div>'
FOOT = '<div class="foot"><span>브루스의 트렌드 노트</span><span>매주 수요일</span></div>'

feed = [
 f'''{TOP(1,6)}<span class="pill">NEW · 매주 수요일</span><div class="grow"></div>
 <h1>트렌드 요약은<br>AI가 3초면 해요.<br>그럼 우리는<br>뭘 읽어야 할까?</h1>
 <p class="lead">사람들이 왜 반응했는지, 우리 브랜드가 가져와도 되는 건 무엇인지.<br>그 다음을 쓰는 뉴스레터를 시작합니다.</p>{FOOT}''',
 f'''{TOP(2,6)}<span class="k">이 노트를 읽는 법</span><h2>형식 말고<br>이유를 저장한다</h2><div class="grow"></div>
 <div class="quote">"형식은 가져오기 쉽지만,<br>이유는 가져오기 어렵다."</div><p class="cite">《AI는 답을 만들고 마케터는 맥락을 설계한다》 1장 중</p>
 <div class="row"><span class="chip">READ</span><span class="chip">ROOT</span><span class="chip">REACH</span><span class="chip">RALLY</span><span class="chip">REMAIN</span></div>{FOOT}''',
 f'''{TOP(3,6)}<span class="k">11월 4일 첫 호 미리보기</span>
 <ol class="list">
 <li><span>01</span><div><b>효율은 AI에게, 설렘엔 돈을</b><small>2027 키워드 '영점소비'</small></div></li>
 <li><span>02</span><div><b>이케아 CMO는 왜 "일관성"을 말할까</b><small>AI 검색 시대의 브랜드</small></div></li>
 <li><span>03</span><div><b>같은 교재가 1억에서 20억이 된 이유</b><small>크리에이터 커머스</small></div></li>
 <li><span>04</span><div><b>AI는 세일이 사흘 남았다는 걸 모른다</b><small>AI 시대 일하는 법</small></div></li>
 <li><span>05</span><div><b>러쉬는 왜 5년째 소셜 광고를 안 할까</b><small>하지 않기로 한 판단</small></div></li>
 </ol><div class="grow"></div>{FOOT}''',
 f'''{TOP(4,6)}<span class="k">첫 호 사례 중 하나</span><h2>같은 영어 교재,<br>바뀐 건 가격이 아니라<br>말하는 사람이었다</h2><div class="grow"></div>
 <div class="big">1억 → <em>20억</em></div><p class="lead">그 교재로 실제 아이를 키운 교사 출신 크리에이터가 말하자, 회당 1억 원 안팎이던 판매가 한 번에 20억 원이 됐다. (CJ온스타일)</p>{FOOT}''',
 f'''{TOP(5,6)}<span class="k">구독 선물</span><h2>AI 검색<br>브랜드 진단 시트</h2><div class="grow"></div>
 <div class="card"><p class="lead" style="color:#111;font-weight:700">우리 브랜드, AI에게 물으면<br>추천될까? 언급만 될까? 없을까?</p>
 <p class="lead">ChatGPT·제미나이·네이버 AI 브리핑에 물어볼 질문 10개 + 기록표 + 결과 읽는 법</p></div>{FOOT}''',
 f'''{TOP(6,6)}<div class="grow"></div><h1>매주 수요일,<br>트렌드를<br>이유까지.</h1>
 <p class="lead">구독하면 'AI 검색 브랜드 진단 시트'를 바로 보내 드려요.</p>
 <span class="btn">프로필 링크에서 구독하기</span><p class="url">bruceheo.com/newsletter</p><div class="grow"></div>{FOOT}''',
]
story = [
 f'''{TOP(1,3)}<div class="grow"></div><span class="pill">NEW</span><h1>트렌드 요약,<br>이제 AI가<br>3초면 해요.</h1>
 <p class="lead">그래서 저는 그 다음을 쓰기로 했어요.<br>사람들은 <b style="color:#111">왜</b> 반응했는지.</p><div class="grow"></div>{FOOT}''',
 f'''{TOP(2,3)}<span class="k">브루스의 트렌드 노트</span><h2>매주 수요일 아침,<br>메일 한 통</h2>
 <div class="box"><ol class="list" style="border-top:0">
 <li><span>01</span><div><b>국내외 사례 4~5개</b><small>숫자와 출처까지</small></div></li>
 <li><span>02</span><div><b>형식 말고 이유</b><small>READ·ROOT·REACH·RALLY·REMAIN</small></div></li>
 <li><span>03</span><div><b>책 속 한 줄과 체크리스트</b><small>바로 써먹는 한 항목</small></div></li></ol></div>
 <div class="grow"></div><p class="lead" style="color:#111;font-weight:700">첫 호는 11월 4일 수요일</p>{FOOT}''',
 f'''{TOP(3,3)}<span class="k">구독 선물</span><h2>AI 검색<br>브랜드 진단 시트</h2>
 <p class="lead">우리 브랜드를 AI에게 물을 질문 10개와 기록표. 구독하면 바로 보내 드려요.</p><div class="grow"></div>
 <div class="sticker">여기에 링크 스티커</div><p class="url">bruceheo.com/newsletter</p>{FOOT}''',
]
for i, body in enumerate(feed, 1):
    (OUT / f"feed-{i:02d}.html").write_text(f"<!doctype html><meta charset=utf-8><style>{CSS % FEED}</style><div class=f>{body}</div>", encoding="utf-8")
for i, body in enumerate(story, 1):
    (OUT / f"story-{i:02d}.html").write_text(f"<!doctype html><meta charset=utf-8><style>{CSS % STORY}.f{{padding:230px 96px 260px}}</style><div class=f>{body}</div>", encoding="utf-8")
print("ok")
