import { isReplyComplaint, repriseIntent } from "./persona.ts";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Only constrain preference questions that explicitly supply the alternatives. */
export function offeredChoices(question: string): string[] {
  const q = question.trim().replace(/[?？!.~]+$/u, "");
  if (/이유|설명|비교|장단점|차이|왜|각각/.test(q)) return [];
  const preference = /골라|고를|추천|택일|(?:뭐|어느|어떤|어디).{0,14}(?:좋|낫|나아|끌|취향)|(?:뭐|뭘|무엇을?)\s*(?:먹을|할|볼|살|입을|고를|마실|들을)까/u;
  const bareVersus = /^[\p{L}\p{N}+#·-]+\s+vs\.?\s+[\p{L}\p{N}+#·-]+$/iu.test(q);
  if (!preference.test(q) && !bareVersus) return [];
  const alternatives = q.match(/^(.+?)\s*중(?:에(?:서)?|에서)?\s*(?:뭐|뭘|무엇|어느|어떤|어디|하나|골라|추천|택일)/u)?.[1]
    ?? q.match(/^(.+?)\s+(?:뭐가 (?:좋|낫)|뭐 (?:먹을|할)까|하나 골라)/u)?.[1]
    ?? (bareVersus ? q : "");
  if (!alternatives) return [];
  const subject = alternatives.split(/[.!?？,\n]/u).at(-1)!.trim()
    .replace(/^(?:(?:너는|넌|너라면|나는|난|그럼|오늘(?:은)?|점심(?:은|으로)?|저녁(?:은|으로)?)\s+)+/u, "");
  const options = subject.split(/\s+(?:vs\.?|or|또는|아니면)\s+|(?:이랑|랑|하고|와|과)\s+/iu)
    .map((option) => option.trim());
  return options.length >= 2 && options.length <= 4 && new Set(options).size === options.length &&
    options.every((option) => /^[\p{L}\p{N}][\p{L}\p{N} +#·-]{0,30}$/u.test(option)) ? options : [];
}

export function choiceGrammar(options: string[]) {
  if (!options.length) return undefined;
  const literals = options.map((option) => JSON.stringify(option)).join(" | ");
  return `root ::= ("난 " | "나는 " | "나라면 " | "오늘은 ")? (${literals}) (" 쪽" | " 고를래" | " 한 표" | " ㄱㄱ")? (" ㅋㅋ" | " ㅎㅎ" | "!" | ".")?`;
}

const attention = /^(?:야|저기|있잖아|어이|진용아)[!?.~\s]*$/u;
export function instantChatReply(question: string, history: ChatMessage[]) {
  if (attention.test(question)) return "왜왜";
  if (/^(?:안녕|하이|ㅎㅇ)[!?.~\s]*$/u.test(question)) return "안녕 ㅋㅋ";
  if (/^(?:미친\s*거야|제정신이야)[?？!\s]*$/u.test(question) || isReplyComplaint(question)) {
    const previous = history.at(-2);
    const reply = history.at(-1);
    const selected = previous && offeredChoices(previous.content).find((option) => reply?.content.includes(option));
    return selected ? `아 ㅋㅋ 그냥 고르면 ${selected} 쪽이라는 뜻이었어` : "내가 말을 이상하게 했나 봐. 어디서 꼬였어?";
  }
  return null;
}

export function chatHistoryFor(question: string, history: ChatMessage[]) {
  // The training examples contain short exchanges. Only include completed turns
  // for a continuation, and start self-contained questions with a clean subject.
  if (offeredChoices(question).length) return [];
  const continuation = /^(?:그럼|그래서|그거|그건|거기|왜|다른 거|좀 더|맞아|응|ㅇㅇ|아니|근데|그리고|나는|난 |그게|그때|어떻게|예를 들|이어서|아까|방금)/u;
  if (continuation.test(question) || repriseIntent(question) || /아까|앞에서|기억나/.test(question)) return history.slice(-4);
  const last = history.at(-2);
  const words = question.match(/[가-힣a-zA-Z0-9]{2,}/g) ?? [];
  return last && words.some((word) => last.content.includes(word)) ? history.slice(-2) : [];
}
