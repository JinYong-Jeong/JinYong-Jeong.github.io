import test from "node:test";
import assert from "node:assert/strict";
import { offeredChoices, choiceGrammar, chatHistoryFor, instantChatReply } from "../src/lib/persona-chat.ts";

const lunch = [
  {role: "user", content: "짜장면이랑 짬뽕중에 뭐 먹을까"},
  {role: "assistant", content: "짬뽕 ㄱㄱ"},
];
const football = "너는 바르셀로나랑 레알마드리드중에 뭐가 좋음?";

test("two new choices are independent of the earlier subject", () => {
  assert.deepEqual(offeredChoices(lunch[0].content), ["짜장면", "짬뽕"]);
  assert.equal(instantChatReply("야", lunch), "왜왜");
  const teams = offeredChoices(football);
  assert.deepEqual(teams, ["바르셀로나", "레알마드리드"]);
  assert.deepEqual(chatHistoryFor(football, lunch), []);
  const grammar = choiceGrammar(teams);
  assert.match(grammar, /바르셀로나.*레알마드리드/);
  assert.doesNotMatch(grammar, /짬뽕/);
  const last = [{role:"user", content:football}, {role:"assistant", content:"난 바르셀로나 쪽"}];
  assert.match(instantChatReply("미친거야?", last), /바르셀로나/);
  assert.deepEqual(chatHistoryFor("왜?", last), last);
});

test("free chat, reasons and factual comparisons remain open-ended", () => {
  for (const q of ["나 오늘 발표 끝났어", "위성과 행성 중에 뭐가 더 커?", "영화랑 산책 중에 뭐가 좋을지 이유도 설명해 줘"])
    assert.deepEqual(offeredChoices(q), []);
  assert.equal(choiceGrammar([]), undefined);
  assert.deepEqual(offeredChoices("프랑스랑 한국 중에 어느 쪽이 더 좋아?"), ["프랑스","한국"]);
  assert.deepEqual(chatHistoryFor("파이썬에서 리스트 길이는?", lunch), []);
  assert.deepEqual(chatHistoryFor("그럼 다른 거 먹을까?", lunch), lunch);
});
