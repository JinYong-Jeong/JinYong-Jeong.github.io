import type { PersonaRecord, PersonaSource } from "../config/persona";

export interface PersonaContext {
  recordIds: string[];
}
export interface PersonaAnswer {
  kind: "record" | "greeting" | "private" | "clarify" | "page";
  paragraphs: string[];
  sources: PersonaSource[];
  suggestions: string[];
  recordIds: string[];
  records: PersonaRecord[];
  supported: boolean;
}

const normalize = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const greeting =
  /^(?:안녕하세요|안녕하십니까|안녕|반가워요?|반갑습니다|감사합니다|고마워요?|hello|hi|hey|thanks)(?:\s+|$)/i;
const transition = /^(?:그럼|그러면|근데|그런데|혹시|저기)\s*/;
const followUp =
  /^(?:그때|거기|그거|그건|그곳|그중|그\s|이건|이것|더 |좀 더|자세|구체|언제|어디|역할|출처|링크|요약|정리|그래서|또 |왜 |방금|앞서|what about|tell me more)/i;
const roleQuestion = /역할|기여|맡|몇.?저자|저자|role|contribut/i;
const dateQuestion =
  /언제|시기|기간|년도|몇.?년|시작|종료|완료|얼마나 걸|when|date/i;
const researchTimingQuestion =
  /시작|종료|완료|끝|착수|(?:연구|참여).{0,8}기간|언제부터|언제까지|언제.{0,10}참여|소요|얼마나 걸|언제.{0,12}(?:연구|했|진행)|(?:연구|참여).{0,10}언제/i;
const detailQuestion = /자세|구체|더 알려|더 설명|자세히|detail|more/i;
const sourceQuestion =
  /출처|근거|링크|어디서\s*(?:볼|보면|확인|읽|찾)|원문|source|link/i;
const placeOfStudy =
  /어디(?:서|에서|에)?\s*(?:공부|다니|다녀|재학)|(?:학교|대학|공부하는 곳).{0,8}어디/;
const privateFact =
  /나이(?=$|\s|[?!.]|[가는를도]|몇|알려)|몇\s?살|생일|생년|연봉|급여|매출|수익|mbti|취미|성격|연애|결혼|혈액형|종교|정치적|집\s?주소|전화번호/i;
const unlistedMetric = /몇\s?명|몇\s?퍼센트|몇\s?%|정확도 수치/;
const preference =
  /개인적인?\s?(생각|의견)|네 생각|너의 생각|좋아[하해]|싫어[하해]|느꼈|가장 중요|제일 중요|가장 의미|가장 보람/i;
const researchInterest =
  /좋아하는\s*(?:연구|학문|기술)\s*(?:분야|주제)?|(?:연구|학문|기술)\s*(?:분야|주제)(?:를|가)?\s*좋아/;

// Recognize questions addressed to the CV owner, including omitted pronouns and Korean spacing.
// Specific subjects such as “ResNet은 뭐 하는 거야?” are still resolved by record retrieval.
function asksForIntroduction(query: string) {
  const addressee =
    /^(?:(?:정?진용(?:님|씨|이|아)?|당신|너|넌)(?:은|는|이|가|께서)?|네가|니가|요즘(?:은|에)?|요새|주로|현재|보통|지금(?:은)?|평소에|도?대체)+/;
  const subject = query
    .replace(greeting, "")
    .replace(transition, "")
    .replace(/\s/g, "")
    .replace(addressee, "");
  return /^(?:(?:뭐|뭘|무얼|무엇을?|어떤일을?|무슨일을?)(?:주로|보통)?[하해했]|뭐먹고사|어떤(?:사람|분)|무슨분|누구|하는일|직업|근황|어떻게지내|자기소개|소개해)/.test(
    subject,
  );
}

function rankRecord(record: PersonaRecord, query: string) {
  let best = 0;
  let matches = 0;
  for (const alias of record.aliases) {
    const needle = normalize(alias);
    if (needle.length >= 2 && query.includes(needle)) {
      best = Math.max(best, Math.min(needle.length, 12) + 3);
      matches++;
    }
  }
  return (
    best + Math.min(matches, 3) + (best && record.id.includes("-") ? 1 : 0)
  );
}

export function answerFromRecords(
  question: string,
  records: PersonaRecord[],
  context: PersonaContext = { recordIds: [] },
  preferredRecordId?: string,
): PersonaAnswer {
  const normalized = normalize(question);
  const query = normalized.replace(greeting, "").replace(transition, "").trim();
  const allSources = (selected: PersonaRecord[]) =>
    [
      ...new Map(
        selected
          .flatMap((item) => item.sources)
          .map((source) => [source.href, source]),
      ).values(),
    ].slice(0, 4);
  const base = (
    selected: PersonaRecord[],
    paragraphs: string[],
    suggestions: string[],
    supported = true,
    kind: PersonaAnswer["kind"] = "record",
  ): PersonaAnswer => ({
    kind,
    paragraphs,
    sources: allSources(selected),
    suggestions,
    recordIds: selected.map((item) => item.id),
    records: selected,
    supported,
  });
  const starters = [
    "요즘 뭐 해?",
    "어떤 연구를 하고 있어?",
    "직접 만든 프로젝트는?",
  ];
  if (!query && greeting.test(normalized))
    return base(
      [],
      [
        /고마|감사|thanks/.test(normalized)
          ? "고마워요! 또 궁금한 게 있으면 편하게 물어보세요."
          : "안녕하세요! 정진용의 AI 챗봇이에요. 제 공부나 프로젝트에 대해 편하게 물어보세요.",
      ],
      starters,
      false,
      "greeting",
    );
  if (
    /(?:실제|진짜|본인|직접).{0,6}(?:진용|사람이|답하|답변하)|(?:너|넌|이거|이건)\s*(?:ai야|ai예요|챗봇이|봇이)|^(?:너|넌|너는)\s*뭐야$/i.test(
      query,
    )
  )
    return base(
      [],
      [
        "저는 정진용의 CV를 바탕으로 대화하는 AI 챗봇이에요. 진용의 공부와 연구, 프로젝트를 소개해 드릴게요.",
      ],
      starters,
      false,
      "greeting",
    );
  if (
    privateFact.test(question) ||
    (preference.test(question) && !researchInterest.test(query))
  )
    return base(
      [],
      ["그 내용은 제 CV에 공개되어 있지 않아요."],
      starters,
      false,
      "private",
    );
  if (researchInterest.test(query)) {
    const research = records.find((item) => item.id === "research")!;
    return base([research], [research.summary], starters, false);
  }
  if (unlistedMetric.test(question))
    return base(
      [],
      [
        "그 수치를 특정하려면 어떤 자료인지 알아야 해요. 관련 연구나 글을 짚어 주실래요?",
      ],
      starters,
      false,
      "clarify",
    );
  const ranked = records
    .map((record) => ({ record, score: rankRecord(record, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const profile = records.find((item) => item.id === "profile")!;
  const studyLocation = placeOfStudy.test(query);
  // Generic words like “소개”, “공부” and the owner's name shouldn't outrank the named subject.
  const topics = ranked.filter(({ record }) => record.id !== "profile");
  const precise = topics.filter(
    ({ record }) => record.publication || record.project,
  );
  const candidates = precise.length ? precise : topics;
  let selected = candidates
    .slice(0, 2)
    .filter(
      (item, index) => index === 0 || item.score >= candidates[0].score - 3,
    )
    .map((item) => item.record);
  if (studyLocation)
    selected = records.filter((item) => item.id === "education");
  const intro = asksForIntroduction(query);
  if (
    !selected.length &&
    (intro || ranked.some(({ record }) => record === profile))
  )
    selected = [profile];
  const preferred = records.find((record) => record.id === preferredRecordId);
  if (preferred) selected = [preferred];
  // A short follow-up retains the previous subject, even when a generic word such as '역할' appears.
  if (
    !preferred &&
    context.recordIds.length &&
    !intro &&
    (!selected.length ||
      (!precise.length &&
        /^(?:그|이)\s*(?:일|연구|논문|프로젝트|기록|활동|경험)(?:에서|의|은|는|을|를|\s|$)/.test(
          query,
        ))) &&
    (followUp.test(query) ||
      roleQuestion.test(question) ||
      dateQuestion.test(question) ||
      sourceQuestion.test(question))
  ) {
    selected = context.recordIds
      .map((id) => records.find((item) => item.id === id))
      .filter((item): item is PersonaRecord => !!item)
      .slice(0, 2);
  }
  if (!selected.length) {
    return base(
      [],
      [
        "어떤 이야기가 궁금하세요? 제 연구나 프로젝트 이름을 알려 주시면 관련 경험부터 말씀드릴게요.",
      ],
      starters,
      false,
      "clarify",
    );
  }
  if (
    selected.every((record) => record.publication) &&
    researchTimingQuestion.test(question)
  ) {
    return base(
      selected,
      selected.map(
        (record) =>
          `${record.title}의 연구 시작·종료 시점이나 제 참여 기간은 공개 기록에 나와 있지 않아요. 논문 표기 연도는 ${record.publication!.year}년이고, 게재·발행 상태는 ${record.publication!.status}입니다.`,
      ),
      ["그 연구에서 맡은 역할은?", "그 기록의 출처를 보고 싶어"],
      false,
    );
  }
  const paragraphs = selected.flatMap((record) => {
    if (roleQuestion.test(question))
      return [
        record.role
          ? `${record.title}에서 제 역할은 ${record.role}입니다.`
          : `${record.summary} 공개 기록에는 이보다 구체적인 개인 역할이 구분되어 있지 않아 추가로 단정하지 않을게요.`,
      ];
    if (dateQuestion.test(question))
      return [
        record.publication
          ? `${record.title}의 논문 표기 연도는 ${record.publication.year}년이고, 게재·발행 상태는 ${record.publication.status}입니다. 연구 수행 기간을 뜻하는 날짜는 아니에요.`
          : record.period
            ? `${record.title}의 공개된 시점·기간은 ${record.period}입니다.`
            : record.id === "awards"
              ? record.details.join("\n")
              : `${record.title}의 정확한 시작·완료 날짜는 이 기록에 따로 나와 있지 않아요.`,
      ];
    if (sourceQuestion.test(question))
      return [
        `${record.title}은 아래 기록에서 확인할 수 있어요. 제 역할과 공개된 상태도 함께 표시해 두었습니다.`,
      ];
    if (detailQuestion.test(question))
      return [record.summary, ...record.details.slice(0, 3)];
    return [
      record.summary,
      ...(record.publication
        ? [
            `${record.role ?? ""} · 논문 표기 ${record.publication.year}년 · ${record.publication.status}`,
          ]
        : []),
    ];
  });
  const subject = selected[0];
  const suggestions =
    subject.id === "profile"
      ? [
          "연구실에서는 뭘 했어?",
          "동아리 활동도 알려 줘",
          "직접 만든 프로젝트는?",
        ]
      : [
          subject.role ? "그 일에서 맡은 역할은?" : "좀 더 자세히 알려 줘",
          "그 기록의 출처를 보고 싶어",
          subject.id === "contact"
            ? "자기소개부터 들려줘"
            : "다른 프로젝트도 소개해 줘",
        ];
  return base(selected, paragraphs.slice(0, 5), suggestions);
}

export function makeGrounding(records: PersonaRecord[]) {
  return records
    .map(
      (record) =>
        `[${record.id}] ${record.title}\n${record.summary}\n${record.details.join("\n")}\n${record.role ? `역할: ${record.role}. ` : ""}${record.period ? `활동/학업 기간: ${record.period}.` : ""}${record.publication ? `논문 표기 연도: ${record.publication.year}. 게재/발행 상태: ${record.publication.status}. 연구 시작·종료 시점과 참여 기간은 공개되지 않았습니다.` : ""}`,
    )
    .join("\n\n")
    .slice(0, 6500);
}

export function cleanPersonaCompletion(raw: string) {
  // A WebLLM delta can end anywhere within a control tag or a UTF-16 pair.
  const bracket = raw.lastIndexOf("<");
  if (bracket !== -1) {
    const tail = raw.slice(bracket).toLowerCase();
    if ("<think>".startsWith(tail) || "</think>".startsWith(tail))
      raw = raw.slice(0, bracket);
  }
  let visible = "";
  let reasoningDepth = 0;
  for (const part of raw.split(/(<\/?think>)/i)) {
    const tag = part.toLowerCase();
    if (tag === "<think>") reasoningDepth++;
    else if (tag === "</think>")
      reasoningDepth = Math.max(0, reasoningDepth - 1);
    else if (reasoningDepth === 0) visible += part;
  }
  return visible
    .replace(/[\uD800-\uDBFF]$/, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .trim()
    .replace(/^정진용(?:은|는)\s*/, "저는 ")
    .replace(/^정진용의\s*/, "제 ");
}

/** High-confidence contradictions only; this is not a general fact-checker. */
export function validatePersonaCompletion(
  text: string,
  records: PersonaRecord[],
  question = "",
) {
  if (
    records.length === 1 &&
    records[0].id === "profile" &&
    asksForIntroduction(normalize(question)) &&
    !/컴퓨터|공학|전공|가천|학부|연구|에이전트|언어\s*모델|llm/i.test(text)
  )
    return false;
  const grounding = makeGrounding(records);
  if (records.some((record) => record.id.startsWith("page:"))) {
    // When a paraphrase reverses cause and remedy, use the selected source passage.
    if (
      /(?:해결|방지|예방)하기\s*위해(?:서)?\s*(?:발생|생긴|일어난)/.test(text)
    )
      return false;
    const requiresParallelRun =
      /(?:동시에?|병렬로)\s*(?:실행|학습|처리)(?:해야|이?\s*필수)/.test(text);
    if (
      requiresParallelRun &&
      /순차\s*(?:실행|학습|처리)/.test(grounding) &&
      !/(?:동시에?|병렬로)\s*(?:실행|학습|처리)해야/.test(grounding)
    )
      return false;
  }
  const years = [...text.matchAll(/\b(?:19|20)\d{2}(?=년|[.\-/\s]|$)/g)].map(
    (match) => match[0],
  );
  if (years.some((year) => !grounding.includes(year))) return false;
  const authorRoles = [...text.matchAll(/제\s*([1-9])\s*저자/g)].map(
    (match) => `제${match[1]}저자`,
  );
  if (authorRoles.some((role) => !grounding.replace(/\s+/g, "").includes(role)))
    return false;
  if (
    records.length === 1 &&
    records[0].publication?.status.includes("발행 예정") &&
    /게재됐|게재되었|발행됐|발행되었|발행된 논문|게재된 논문/.test(text)
  )
    return false;
  if (records.some((record) => record.publication)) {
    const inventedTiming = text
      .split(/[.!?。\n]/)
      .some(
        (sentence) =>
          /연구\s*기간|참여\s*기간|연구.{0,16}(?:시작|종료|완료)|(?:시작|종료|착수).{0,20}(?:19|20)\d{2}|(?:19|20)\d{2}.{0,20}(?:시작|종료|착수|연구했|진행했)/.test(
            sentence,
          ) &&
          !/공개.{0,12}않|확인.{0,12}없|미공개|나와.{0,12}않|알 수 없|뜻하.{0,8}아니/.test(
            sentence,
          ),
      );
    if (inventedTiming) return false;
  }
  if (
    records.some((record) => record.id === "portfolio") &&
    /(?:사용자|방문자)(?:가|는|의)?\s*(?:자신|본인|자기)/.test(text)
  )
    return false;
  return true;
}

export function personaEntryRequested(href: string) {
  const url = new URL(href);
  return url.searchParams.get("ask") === "1" || url.hash === "#persona-guide";
}

export function personaClosedUrl(href: string) {
  const url = new URL(href);
  if (url.hash === "#persona-guide") url.hash = "";
  url.searchParams.delete("ask");
  return url;
}
