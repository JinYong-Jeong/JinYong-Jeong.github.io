import assert from "node:assert/strict";
import test from "node:test";
import { personaRecords } from "../src/config/persona.ts";
import {
  answerFromRecords,
  cleanPersonaCompletion,
  needsPersonaReferences,
  standaloneGreeting,
  isReplyComplaint,
  withProjectArchive,
  validatePersonaCompletion,
} from "../src/lib/persona.ts";

const ask = (question, recordIds = []) =>
  answerFromRecords(question, personaRecords, { recordIds });

test("streamed text reveals only the answer, including when a token splits a reasoning tag", () => {
  const withReasoning = "<think>초안<THINK>검토</THINK>추론</think>안녕하세요";
  const answerStart = withReasoning.indexOf("안녕");
  for (let end = 1; end <= withReasoning.length; end++) {
    assert.equal(
      cleanPersonaCompletion(withReasoning.slice(0, end)),
      withReasoning.slice(answerStart, end),
    );
  }
  assert.equal(cleanPersonaCompletion("첫 줄\n\n<think>검토"), "첫 줄");
  assert.equal(
    cleanPersonaCompletion("첫 줄\n\n<think>검토</think>둘째 줄"),
    "첫 줄\n\n둘째 줄",
  );
  assert.equal(cleanPersonaCompletion("x < 3"), "x < 3");
  assert.equal(cleanPersonaCompletion("안녕 \uD83D"), "안녕");
  assert.equal(cleanPersonaCompletion("안녕 👋"), "안녕 👋");
});

test("a greeting followed by an ordinary question about Jinyong reaches his CV", () => {
  const greeting = ask("안녕");
  assert.equal(greeting.kind, "greeting");
  for (const question of [
    "뭐하는 사람이야?",
    "안녕하세요, 무슨 일을 하세요?",
    "진용아 요즘 뭐 해?",
    "네가 하는 일이 뭐야?",
    "직업이 뭐야?",
  ]) {
    const answer = ask(question, greeting.recordIds);
    assert.equal(answer.supported, true, question);
    assert.deepEqual(answer.recordIds, ["profile"], question);
    assert.match(answer.paragraphs.join(" "), /컴퓨터공학/);
    assert.match(answer.paragraphs.join(" "), /AI 에이전트/);
    assert.equal(
      validatePersonaCompletion(
        "안녕하세요. 저는 정진용입니다.",
        answer.records,
        question,
      ),
      false,
    );
    assert.equal(
      validatePersonaCompletion(answer.paragraphs[0], answer.records, question),
      true,
    );
  }
});

test("a named new subject wins over a greeting, a profile keyword or the previous topic", () => {
  assert.equal(ask("안녕하세요! 논문을 소개해 줘").recordIds[0], "system-1");
  assert.deepEqual(ask("그럼 동아리에서는 뭐 했어?", ["system-1"]).recordIds, [
    "community",
  ]);
  assert.equal(
    ask("그 연구에서 맡은 역할은?", ["system-1"]).recordIds[0],
    "system-1",
  );
  assert.equal(ask("어디서 공부해?").recordIds[0], "education");
});

test("private and unclear questions do not turn into contact requests", () => {
  assert.equal(ask("진용이 MBTI가 뭐야?").kind, "private");
  assert.equal(ask("내일 날씨 어때?").kind, "clarify");
  assert.deepEqual(ask("몇 살이야?").sources, []);
  assert.equal(ask("이메일 주소 알려 줘").recordIds[0], "contact");
});

test("interview questions keep the same grounded first-person answer across forms of address", () => {
  const categories = [
    {
      id: "interview-fit",
      prompts: [
        "당신을 뽑아야하는 이유는?",
        "진용을 뽑아야하는 이유는?",
        "너 왜 뽑아야돼?",
        "우리 팀이 당신을 채용해야 하는 이유는?",
        "너를 뽑으면 우리 팀에 어떤 도움이 돼?",
        "우리가 왜 너를 채용해야 해?",
        "왜 뽑아야 돼?",
        "Why should we hire you?",
      ],
      evidence: /제1저자.*건강 예측 모델/,
    },
    {
      id: "interview-strength",
      prompts: [
        "당신의 장점은?",
        "진용의 장점은?",
        "네 강점은?",
        "네가 가진 강점은?",
        "너는 뭐 잘해?",
        "프로젝트에서 네 강점은?",
        "진용 씨의 가장 큰 장점은?",
        "뭘 잘해?",
        "장점은?",
        "What are your strengths?",
      ],
      evidence: /Galaxy S24 Ultra/,
    },
    {
      id: "interview-weakness",
      prompts: [
        "진용의 단점은?",
        "당신의 단점은?",
        "너의 단점은?",
        "본인의 약점은?",
        "안녕, 그럼 단점은?",
        "보완할 점은?",
      ],
      evidence: /제가 스스로 꼽은 단점은 공개 CV에 적어 두지 않았어요/,
    },
  ];
  for (const { id, prompts, evidence } of categories) {
    const expected = ask(prompts[0]);
    assert.equal(expected.kind, "interview");
    assert.deepEqual(expected.recordIds, [id]);
    assert.ok(expected.sources.length);
    assert.match(expected.paragraphs.join(" "), evidence);
    for (const prompt of prompts)
      assert.deepEqual(ask(prompt), expected, prompt);
  }
});

test("evaluation tracks the person, a referenced project, or the previous page", () => {
  assert.deepEqual(ask("장단점은?").recordIds, [
    "interview-strength",
    "interview-weakness",
  ]);
  assert.equal(
    ask("그럼 단점은?", ["interview-strength"]).recordIds[0],
    "interview-weakness",
  );
  assert.equal(ask("그 근거는?", ["interview-fit"]).kind, "interview");
  assert.equal(ask("네가 만든 프로젝트의 장점은?").recordIds[0], "work");
  assert.equal(
    ask("FedOps의 장점은?", ["interview-fit"]).recordIds[0],
    "fedops",
  );
  assert.equal(ask("그럼 단점은?", ["fedops"]).recordIds[0], "fedops");
  assert.notEqual(
    ask("그럼 단점은?", ["page:/blog/article"]).kind,
    "interview",
  );
  assert.equal(ask("너의 단점은?", ["page:/blog/article"]).kind, "interview");
  assert.equal(ask("너는 민수의 단점이 뭐라고 생각해?").kind, "clarify");
  assert.notEqual(
    ask("너는 왜 민수를 뽑아야 한다고 생각해?").kind,
    "interview",
  );
  assert.notEqual(
    ask("너는 민수를 뽑으면 우리 팀에 어떤 도움이 된다고 봐?").kind,
    "interview",
  );
  assert.notEqual(ask("내 장점은?").kind, "interview");
  assert.equal(ask("채용 문의 이메일은?").recordIds[0], "contact");
});

test("names and pronouns do not change ordinary CV lookups", () => {
  for (const [topic, id] of [
    ["연구", "research"],
    ["전공", "education"],
    ["프로젝트", "work"],
    ["링크드인", "contact"],
  ]) {
    const expected = ask(topic);
    assert.equal(expected.recordIds[0], id);
    for (const address of [
      "진용의",
      "정진용 씨의",
      "너의",
      "네",
      "당신의",
      "본인의",
    ])
      assert.deepEqual(ask(`${address} ${topic}는?`), expected);
  }
  assert.equal(ask("당신의 MBTI는?").kind, "private");
  assert.equal(ask("진용의 생각은?").kind, "private");
  assert.equal(ask("네가 만든 ResNet 교육자료는?").recordIds[0], "aing-resnet");
});

test("ordinary chat skips retrieval even after discussing a CV record", () => {
  for (const recordIds of [[], ["fedops"]]) {
    for (const question of ["안녕!", "점심 메뉴 좀 골라줘", "김치찌개 끓이는 법 알려줘", "파이썬 리스트 정렬 방법은?", "오늘 너무 힘들어", "이력서 쓰는 법 알려줘", "논문을 읽는 방법 알려줘"]) {
      assert.equal(needsPersonaReferences(question, {recordIds}), false, question);
    }
  }
  for (const question of ["너는 뭘 잘해?", "어디서 공부해?", "자기소개 해줘", "FedOps에서 뭘 맡았어?", "이 글 요약해 줘"]) {
    assert.equal(needsPersonaReferences(question, {recordIds: []}), true, question);
  }
  assert.equal(needsPersonaReferences("그때 역할은?", {recordIds:["fedops"]}), true);
  assert.equal(needsPersonaReferences("자세히", {recordIds:[]}), false);
  assert.equal(needsPersonaReferences("알려줘", {recordIds:[]}, "education"), true);
});

test("a standalone greeting is immediate, but a new question after a greeting is answered", () => {
  assert.deepEqual(standaloneGreeting("안녕!")?.paragraphs, ["안녕! 반가워."]);
  assert.equal(standaloneGreeting("안녕하세요! 최근에 논문 뭐 썼어요?"), null);
  assert.equal(standaloneGreeting("안녕! 점심 뭐 먹을까?"), null);
  assert.equal(isReplyComplaint("바보임?"), true);
  assert.equal(isReplyComplaint("바보라는 말이 무슨 뜻이야?"), false);
});

test("recent papers, explanations and personal contributions keep the concrete paper in focus", () => {
  for (const q of ["너 최근에 논문 뭐 썼어?", "최근에 어떤 논문을 쓰셨어요?", "논문 뭐 썼어?"]) {
    assert.equal(needsPersonaReferences(q, { recordIds: [] }), true, q);
    const recent = ask(q);
    assert.deepEqual(recent.recordIds, ["system-1", "gpu-scheduling", "inference-caching"]);
    assert.match(recent.paragraphs[0], /System 1.*제1저자.*구두 발표/);
    assert.match(recent.paragraphs.join(" "), /발행 예정/);
    assert.ok(recent.sources.some((s) => s.href === "/#system-1"));
    const explain = ask("아니 뭔 말이야", recent.recordIds);
    assert.match(explain.paragraphs[0], /작은 판단 모델/);
    assert.deepEqual(explain.recordIds, ["system-1"]);
    for (const follow of ["너 뭐했냐고", "거기서 뭘 했어?", "네가 맡은 역할은?"]) {
      assert.equal(needsPersonaReferences(follow, { recordIds: explain.recordIds }), true, follow);
      const role = ask(follow, explain.recordIds);
      assert.match(role.paragraphs[0], /제1저자.*구두 발표/);
      assert.deepEqual(role.recordIds, ["system-1"]);
    }
    const second = ask("두 번째 논문을 쉽게 설명해 줘", recent.recordIds);
    assert.deepEqual(second.recordIds, ["gpu-scheduling"]);
    assert.match(second.paragraphs[0], /GPU/);
    assert.deepEqual(ask("이메일 주소 알려 줘", explain.recordIds).recordIds, ["contact"]);
    assert.equal(needsPersonaReferences("점심 뭐 먹지?", { recordIds: explain.recordIds }), false);
  }
});

test("recent projects use the archive date, keep the project for follow-ups and follow archive changes", () => {
  const archive = [
    { id: "portfolio", title: "CV", href: "https://github.com/JinYong-Jeong/JinYong-Jeong.github.io", date: "2026-11-19", updated: true, description: "개인 CV", techStack: ["Astro"] },
    { id: "other", title: "교육용 노트북", date: "2026-09-02", updated: false, description: "학습 자료를 보관합니다.", techStack: ["Python"] },
  ];
  const records = withProjectArchive(personaRecords, archive);
  const question = "아니 너 최근에 한 프로젝트가 뭐야?";
  assert.equal(needsPersonaReferences(question, {recordIds: []}), true);
  const recent = answerFromRecords(question, records);
  assert.deepEqual(recent.recordIds, ["portfolio"]);
  assert.match(recent.paragraphs.join(" "), /Personal portfolio.*책장.*업데이트.*2026-11-19/);
  assert.ok(recent.sources.some((s) => s.href === "/projects/#portfolio"));
  const detail = answerFromRecords("좀 더 자세히 알려 줘", records, {recordIds: recent.recordIds});
  assert.deepEqual(detail.recordIds, ["portfolio"]);
  assert.match(detail.paragraphs.join(" "), /Personal portfolio.*근거 링크.*WebGPU/);
  assert.equal(needsPersonaReferences("요즘 할 만한 프로젝트 아이디어 추천해줘", {recordIds: []}), false);
  archive[1].date = "2026-11-20";
  assert.deepEqual(answerFromRecords(question, withProjectArchive(personaRecords, archive)).recordIds, ["archive-other"]);
});
