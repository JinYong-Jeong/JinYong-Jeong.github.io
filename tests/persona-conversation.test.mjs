import assert from "node:assert/strict";
import test from "node:test";
import { personaRecords } from "../src/config/persona.ts";
import {
  answerFromRecords,
  validatePersonaCompletion,
} from "../src/lib/persona.ts";

const ask = (question, recordIds = []) =>
  answerFromRecords(question, personaRecords, { recordIds });

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
  assert.equal(ask("안녕하세요! 논문을 소개해 줘").recordIds[0], "research");
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
