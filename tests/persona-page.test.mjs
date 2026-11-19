import assert from "node:assert/strict";
import test from "node:test";
import {
  answerFromRecords,
  validatePersonaCompletion,
} from "../src/lib/persona.ts";
import { personaRecords } from "../src/config/persona.ts";
import {
  answerFromPage,
  extractPageContext,
  makePageGrounding,
} from "../src/lib/persona-page.ts";

const element = (tag, text, attrs = {}) => ({
  tag,
  attrs,
  children: [{ text }],
});
const article = extractPageContext({
  url: "https://example.org/blog/note/",
  title: "토크나이저 실험",
  main: {
    tag: "main",
    children: [
      element("h1", "토크나이저 실험"),
      element("h2", "실패 원인", { id: "cause" }),
      element(
        "p",
        "서버와 클라이언트의 토크나이저 버전이 달라 출력이 달라졌습니다.",
      ),
      { tag: "form", children: [element("p", "비공개 입력 예정 내용")] },
      element("p", "숨긴 내부 자료", { hidden: "" }),
    ],
  },
});

test("an article question gets its evidence and link from the displayed document", () => {
  const question = "이 글에서 토크나이저가 왜 문제였어?";
  const result = answerFromPage(question, article, {
    core: answerFromRecords(question, personaRecords),
  });
  assert.equal(result.kind, "page");
  assert.ok(result.sources.some(({ href }) => href === "/blog/note/#cause"));
  const evidence = JSON.stringify(
    JSON.parse(makePageGrounding(result.records, question)).reference,
  );
  assert.match(evidence, /버전이 달라/);
  assert.doesNotMatch(evidence, /비공개 입력|숨긴 내부/);
});

test("the visible summary starter works with spaced and unspaced Korean verbs", () => {
  for (const question of [
    "이 글 요약해 줘",
    "이 글 요약해줘",
    "이 글을 두 문장으로 설명해 주세요",
  ]) {
    const result = answerFromPage(question, article);
    assert.equal(result?.supported, true, question);
    assert.ok(result.sources.length > 0);
  }
});

test("an article follow-up keeps its subject until the visitor addresses Jinyong", () => {
  const previous = answerFromPage("이 글 요약해 줘", article);
  const context = { recordIds: previous.recordIds };
  for (const question of ["그럼 단점은?", "장점은?"]) {
    const core = answerFromRecords(question, personaRecords, context);
    assert.equal(answerFromPage(question, article, { previous, core })?.kind, "page", question);
  }
  for (const question of ["너의 단점은?", "진용을 왜 뽑아야 돼?"]) {
    const core = answerFromRecords(question, personaRecords, context);
    assert.equal(core.kind, "interview", question);
    assert.equal(answerFromPage(question, article, { previous, core }), null, question);
  }
});

test("the page does not replace a question about Jinyong or provide admin content", () => {
  for (const question of ["뭐하는 사람이야?", "진용이 MBTI가 뭐야?"]) {
    assert.equal(
      answerFromPage(question, article, {
        core: answerFromRecords(question, personaRecords),
      }),
      null,
    );
  }
  assert.equal(
    extractPageContext({
      url: "https://example.org/admin/",
      title: "관리",
      main: element("p", "관리용 본문"),
    }),
    null,
  );
});

test("a paraphrase cannot make simultaneous execution mandatory when the article gives a sequential alternative", () => {
  const record = {
    id: "page:/blog/note/",
    title: "메모리 사용",
    summary: "클라이언트를 순차 실행하여 메모리 사용량을 줄였다.",
    details: [],
  };
  assert.equal(
    validatePersonaCompletion("여러 클라이언트를 동시에 실행해야 합니다.", [
      record,
    ]),
    false,
  );
  assert.equal(
    validatePersonaCompletion(
      "실험에서는 클라이언트를 차례로 실행해 메모리 사용량을 낮췄습니다.",
      [record],
    ),
    true,
  );
});
