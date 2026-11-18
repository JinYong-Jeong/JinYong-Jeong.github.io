import type { PersonaRecord, PersonaSource } from "../config/persona";

export interface PersonaContext {
  recordIds: string[];
}
export interface PersonaAnswer {
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
const followUp =
  /^(그|이것|이건|그것|그건|그러면|그럼|더 |좀 더|자세|구체|언제|어디|역할|출처|링크|요약|정리|그래서|또 |왜 |방금|앞서|what about|tell me more)/i;
const roleQuestion = /역할|기여|맡|몇.?저자|저자|role|contribut/i;
const dateQuestion =
  /언제|시기|기간|년도|몇.?년|시작|종료|완료|얼마나 걸|when|date/i;
const researchTimingQuestion =
  /시작|종료|완료|끝|착수|(?:연구|참여).{0,8}기간|언제부터|언제까지|언제.{0,10}참여|소요|얼마나 걸|언제.{0,12}(?:연구|했|진행)|(?:연구|참여).{0,10}언제/i;
const detailQuestion = /자세|구체|더 알려|더 설명|자세히|detail|more/i;
const sourceQuestion = /출처|근거|링크|어디서|원문|source|link/i;

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
  const query = normalize(question);
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
  ): PersonaAnswer => ({
    paragraphs,
    sources: allSources(selected),
    suggestions,
    recordIds: selected.map((item) => item.id),
    records: selected,
    supported,
  });
  const unknown = () =>
    base(
      [records.find((item) => item.id === "contact")!],
      [
        "그 질문은 제 공개 기록만으로는 정확히 답하기 어려워요. 제 개인적인 생각이나 아직 공개하지 않은 내용은 직접 연락해 주세요.",
        "연구, 개발한 프로젝트, 동아리 활동, 학력과 수상 기록은 여기서 이어서 물어볼 수 있어요.",
      ],
      ["동아리에서는 뭘 했어?", "대표 연구를 소개해 줘", "연락 방법 알려 줘"],
      false,
    );
  if (
    /나이|몇\s?살|생일|생년|연봉|급여|매출|수익|mbti|취미|성격|연애|결혼|혈액형|종교|정치적|집 주소|전화번호|개인적인?\s?(생각|의견)|네 생각|너의 생각|좋아하|싫어하|느꼈|가장 중요|제일 중요|가장 의미|가장 보람|몇\s?명|몇\s?퍼센트|몇\s?%|정확도 수치/i.test(
      question,
    )
  )
    return unknown();
  if (/^(안녕|반가|hello|hi(?:\s|$)|고마|감사)/i.test(query)) {
    const profile = records.find((item) => item.id === "profile")!;
    return base(
      [profile],
      [
        /고마|감사/.test(query)
          ? "읽어 줘서 고마워요. 다른 경험이 궁금하면 이어서 물어봐 주세요."
          : "반가워요. 제 공개 기록을 바탕으로 연구와 개발, 함께한 활동을 이야기해 드릴게요. 어떤 이야기가 궁금한가요?",
      ],
      ["어떤 사람인지 소개해 줘", "함께한 활동이 궁금해"],
    );
  }
  const ranked = records
    .map((record) => ({ record, score: rankRecord(record, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  let selected = ranked
    .slice(0, 2)
    .filter((item, index) => index === 0 || item.score >= ranked[0].score - 3)
    .map((item) => item.record);
  const preferred = records.find((record) => record.id === preferredRecordId);
  if (preferred) selected = [preferred];
  // A short follow-up retains the previous subject, even when a generic word such as '역할' appears.
  if (
    !preferred &&
    context.recordIds.length &&
    (!selected.length || followUp.test(question.trim())) &&
    (followUp.test(question.trim()) ||
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
    return unknown();
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
  return raw
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "")
    .replace(/<\/?think>/g, "")
    .trim()
    .replace(/^정진용(?:은|는)\s*/, "저는 ")
    .replace(/^정진용의\s*/, "제 ");
}

/** High-confidence contradictions only; this is not a general fact-checker. */
export function validatePersonaCompletion(
  text: string,
  records: PersonaRecord[],
) {
  const grounding = makeGrounding(records);
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
