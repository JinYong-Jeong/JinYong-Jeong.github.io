import type { PersonaRecord, PersonaSource } from "../config/persona";
import type { Project } from "./content";

interface ArchiveProject {
  id: string;
  title: string;
  description: string;
  techStack: string[];
  href?: string;
  date: string;
  updated: boolean;
}

export function projectSnapshot(projects: Project[]): ArchiveProject[] {
  return projects.filter(({ data }) => data.status !== "fork" && data.status !== "idea")
    .map(({ id, data }) => ({
      id, title: data.title, description: data.description, techStack: data.techStack,
      href: data.links.find((link) => link.label.toLowerCase() === "github")?.href ?? data.links[0]?.href,
      date: data.date.toISOString().slice(0, 10), updated: data.source === "github",
    }));
}

export function withProjectArchive(records: PersonaRecord[], projects: ArchiveProject[]) {
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const project of projects) {
    const curated = project.href && records.find((record) => record.project && record.sources.some((source) => source.href === project.href));
    const entry: PersonaRecord = curated || {
      id: `archive-${project.id}`, title: project.title, aliases: [project.title, project.id],
      summary: project.description, project: true, details: [], sources: [],
    };
    const archive = { label: project.title, href: `/projects/#${encodeURIComponent(project.id)}`, detail: project.description };
    const sources = [archive, ...entry.sources];
    if (project.href && !sources.some((source) => source.href === project.href))
      sources.push({ label: "프로젝트 원문", href: project.href, detail: project.title });
    const details = curated ? entry.details : project.techStack.length ? [`공개된 기술은 ${project.techStack.join(", ")}예요.`] : [];
    byId.set(entry.id, { ...entry, projectDate: { day: project.date, updated: project.updated }, details, sources });
  }
  return [...byId.values()];
}

export interface PersonaContext {
  recordIds: string[];
}
export interface PersonaAnswer {
  kind: "chat" | "record" | "interview" | "greeting" | "private" | "clarify" | "page";
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
/** A bare greeting is a complete turn. A question after a greeting still needs an answer. */
export function standaloneGreeting(question: string): PersonaAnswer | null {
  const q = normalize(question);
  if (!greeting.test(q) || q.replace(greeting, "").trim()) return null;
  const text = /고마|감사|thanks/.test(q) ? "고마워요!"
    : /^(안녕|반가워|hi|hey|hello)$/.test(q) ? "안녕! 반가워." : "안녕하세요! 반가워요.";
  return { kind: "greeting", supported: false, paragraphs: [text], suggestions: [],
    records: [], recordIds: [], sources: [] };
}

export function repriseIntent(question: string) {
  const q = normalize(question).replace(/^(?:(?:아니|그러니까|그래서|그럼|아|그래)\s*)+/, "");
  if (/^(?:(?:넌|너는?|네가|니가|직접|거기서|그때)\s*)*(?:뭐|뭘|무엇을?|무슨\s*일을?)\s*(?:했(?:어|어요|냐|냐고|는데|는데요|다고)?|한\s*거(?:야|예요|냐고)?|맡았(?:어|어요|냐고)?)(?:요)?$/.test(q)) return "contribution";
  if (/^(?:(?:그게|그건|이게|그거|그건 대체)\s*)?(?:(?:뭔|무슨)\s*(?:말|소리|뜻)(?:인지|이에요|이야|인가요|임|야|이냐|이죠)?|이해(?:가)?\s*(?:잘\s*)?안\s*(?:돼|되네|가|돼요)|(?:다시|쉽게|풀어서|쉽게 다시)\s*(?:말|설명)(?:해|해줘|해 줘|해 주세요|해봐))$/.test(q)) return "explain";
  return null;
}

export function isReplyComplaint(question: string) {
  const q = normalize(question).replace(/^(?:아니|아)\s*/, "");
  return /^(?:(?:너|너는|넌)\s*)?(?:바보(?:임|야|냐|니)|동문서답(?:이야|이네|이잖아)?|(?:자꾸\s*)?딴소리(?:야|하네|잖아)|(?:왜\s*)?(?:답변|대답)(?:이|이 왜)?\s*(?:이상해|이래|엉뚱해))$/.test(q);
}

function asksForPapers(q: string) {
  return /(?:논문|출판물|publications?|papers?)/i.test(q) &&
    /최근|요즘|최신|목록|어떤|무슨|뭐|뭘|썼|쓴|쓰셨|쓰셨어|작성했|발표했|참여했|전부|모두|전체|소개|recent|latest|your papers/i.test(q);
}

function asksForRecentProject(q: string) {
  return /최근|요즘|요새|마지막|최신|most recent|latest/.test(q) && /프로젝트|작업|project/.test(q) &&
    !/추천|동향|트렌드|아이디어|다른 사람|뉴스|하는 법|관리 도구/.test(q);
}

function paperOrdinal(q: string) {
  return /(?:첫\s*번째|첫째|첫)\s*(?:논문|연구)/.test(q) ? 0
    : /(?:두\s*번째|둘째)\s*(?:논문|연구)/.test(q) ? 1
    : /(?:세\s*번째|셋째)\s*(?:논문|연구)/.test(q) ? 2 : -1;
}

function describePaperRole(record: PersonaRecord) {
  if (!record.role) return "";
  const [author, presentation] = record.role.split(" · ");
  return presentation ? `${author}로 참여해 ${presentation}를 맡았어요.` : `${author}로 참여했어요.`;
}
const transition = /^(?:(?:그럼|그러면|근데|그런데|혹시|저기|그리고)\s*)+/;
// Keep the addressee in place while resolving ownership ("네 강점" vs "네 프로젝트의 강점").
// Then remove it from keyword retrieval so the owner's name cannot outrank the actual topic.
const ownerTerm =
  /(?:^|\s)(?:(?:(?:정\s*)?진용(?:\s*(?:님|씨)|이|아)?|당신|귀하|본인|너)(?:께서|에게|한테|의|을|를|은|는|이|가|에)?|넌|널|네가|니가|네|니|you(?:rself|r)?|jinyong(?:\s+jeong)?)(?=\s|$|장단점|장점|단점|강점|약점|왜|뽑|채용)/g;
const followUp =
  /^(?:그때|거기|그거|그건|그곳|그중|그\s|이건|이것|더 |좀 더|자세|구체|언제|어디|역할|장단점|장점|단점|강점|약점|출처|링크|요약|정리|그래서|또 |왜 |방금|앞서|what about|tell me more)/i;
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
const aboutOwner =
  /^@(?:\s*에)?\s*대해(?:서)?(?:\s|$)|^(?:who are @|what do @ do|what are @ working on|(?:tell me )?about @)$/;

function interviewTopics(addressed: string, context: PersonaContext): string[] {
  const selection = /뽑|채용|고용|선발|영입/u.exec(addressed);
  const hiringBenefit =
    /(?:뽑으면|(?:채용|고용|영입|선발)하면).*(?:도움|기여|뭐가\s*좋|장점|이점)/.test(
      addressed,
    );
  if (
    selection &&
    (hiringBenefit || /왜|이유|근거|해야|필요|가치|메리트/.test(addressed))
  ) {
    const before = addressed.slice(0, selection.index).trim();
    // Match the candidate being selected. A recruiter addressing the avatar can also ask about a third person.
    const candidate =
      /(?:^|@\s*)(?:(?:(?:우리|저희)(?:가|는|\s*(?:팀|회사|조직)(?:에서|이|가|에|은|는)?)|면접관이|지원자로|팀원으로|왜|꼭|굳이|다시)\s*)*$/.test(
        before,
      );
    if (candidate) return ["interview-fit"];
  }
  if (/\b(?:hire|choose|recruit|pick)\s+@/.test(addressed))
    return ["interview-fit"];

  const assessment =
    /장단점|장점|강점|잘하는\s*(?:점|것|게|일)|잘해|strengths?|단점|약점|부족한\s*(?:부분|점)|보완(?:해야\s*할|할)\s*점|weakness(?:es)?/g;
  const matches = [...addressed.matchAll(assessment)];
  if (!matches.length) return [];
  const prefix = addressed.slice(0, matches[0].index).trim();
  const qualifiers =
    /(?:(?:가장|제일|큰|대표적인|가진|가지고\s*있는|스스로\s*생각하는|어떤|뭘|무엇을|뭐가?|특히|일할\s*때|업무상)\s*)+$/;
  const owner = prefix.replace(qualifiers, "").trim();
  const explicitOwner = owner.endsWith("@");
  const implicitOwner = !owner || /^(?:what are|what is)$/.test(owner);
  const priorSubjectIsOwner = context.recordIds.every(
    (id) =>
      id.startsWith("interview-") || id === "profile" || id === "education",
  );
  if (!explicitOwner && !(implicitOwner && priorSubjectIsOwner)) return [];
  const ids = new Set<string>();
  for (const [word] of matches) {
    if (word === "장단점" || /장점|강점|잘하|잘해|strength/.test(word))
      ids.add("interview-strength");
    if (word === "장단점" || /단점|약점|부족|보완|weakness/.test(word))
      ids.add("interview-weakness");
  }
  return [...ids];
}

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

/** Route before scanning the CV records or extracting text from the current page. */
export function needsPersonaReferences(question: string, context: PersonaContext, preferredRecordId?: string, articleTitle = "") {
  if (preferredRecordId) return true;
  const q = normalize(question).replace(greeting, "").replace(transition, "").trim();
  if (!q) return false;
  const addressed = q.replace(ownerTerm, " @ ").replace(/\s+/g, " ").trim();
  // A writing or study request can mention CV topics without asking about this person or site.
  if (!addressed.includes("@") && /(?:쓰는|읽는|만드는|시작하는|작성하는|작성|준비하는|공부하는)\s*(?:방법|법|요령|팁)|예시(?:를)?\s*(?:만들|써)|대신\s*써/.test(q) && !/(?:이|현재)\s*(?:글|페이지|본문)|공개 기록/.test(q)) return false;
  if (context.recordIds.length && (repriseIntent(question) || isReplyComplaint(question) || paperOrdinal(q) >= 0)) return true;
  if (asksForRecentProject(q)) return true;
  if (asksForPapers(q) && (addressed.includes("@") || /썼|쓰셨|쓰셨어|발표했|참여했|출판물|논문\s*목록|your papers/.test(q))) return true;
  if (asksForIntroduction(q) || interviewTopics(addressed, context).length || placeOfStudy.test(q)) return true;
  if (/(?:이|그|현재|지금 보고 있는)\s*(?:글|페이지|본문|사이트|포스트|프로젝트|연구|논문)|this (?:page|article|post)|your (?:work|research|projects|education)|어떤 연구|공개 기록|자기소개|포트폴리오|이력서|학력|경력|직접 만든|가천대|fedops|system\s*1|개인건강데이터|a\s*ing|resnet 교육자료|연락처|이메일 주소|깃허브 주소/i.test(q)) return true;
  if (/^(?:논문|연구|프로젝트|동아리|블로그|수상|활동|연락|학업)(?:$|을|를|에서|는|은|에 대해| 목록| 소개| 알려| 보여)/.test(q)) return true;
  if (articleTitle && normalize(articleTitle).split(/\s+/).some((word) => word.length >= 4 && q.includes(word))) return true;
  if (/(?:현재|여기|방금\s*(?:본|읽은)).{0,8}(?:내용|페이지|글|프로젝트)|깃허브|링크드인|공개 이메일|fedllm|sound haptic/i.test(q)) return true;
  if (addressed.includes("@") && /연구|프로젝트|공부|활동|학교|전공|논문|경험|역할|이력|학력|수상|연락|회사|깃허브|블로그|생일|집주소|전화번호/.test(q)) return true;
  return context.recordIds.length > 0 && /^(?:더 알려|자세히|좀 더|더 자세|(?:그거|그건|그때|거기|방금|앞서)|(?:역할|기여|기간|출처|장점|단점|장단점|왜|언제|어디서)(?:$|은|는|이|가|요|였|야|\s*(?:뭐|알려|했|부터|했어)))/.test(q);
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
  const questionBody = normalized
    .replace(greeting, "")
    .replace(transition, "")
    .trim();
  const addressed = questionBody
    .replace(ownerTerm, " @ ")
    .replace(/\s+/g, " ")
    .trim();
  const query = addressed.replace(/@/g, " ").replace(/\s+/g, " ").trim();
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
  const hello = standaloneGreeting(question);
  if (hello) return hello;
  if (
    /^@\s*(?:뭐야$|ai야|ai예요|챗봇이|봇이)/.test(addressed) ||
    /(?:실제|진짜|본인|직접).{0,6}(?:진용|사람이|답하|답변하)|(?:너|넌|이거|이건)\s*(?:ai야|ai예요|챗봇이|봇이)|^(?:너|넌|너는)\s*뭐야$/i.test(
      questionBody,
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
    ((preference.test(question) || /@\s*생각/.test(addressed)) &&
      !researchInterest.test(query))
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
  const interviewSuggestions = [
    "System 1 연구에서 맡은 역할은?",
    "개인건강데이터 연구를 소개해 줘",
    "ResNet 교육자료를 보고 싶어",
  ];
  const reprise = !preferredRecordId && (repriseIntent(question) || (isReplyComplaint(question) && "explain"));
  const ordinal = paperOrdinal(query);
  const referencedPaper = !preferredRecordId && ordinal >= 0 && records.find(
    (record) => record.publication && record.id === context.recordIds[ordinal],
  );
  const previous = referencedPaper || (reprise && records.find((record) => record.id === context.recordIds[0]));
  if (previous) {
    const paper = previous.publication;
    const paragraphs = paper
      ? [reprise === "contribution" || roleQuestion.test(question)
          ? `「${previous.title}」에서는 ${describePaperRole(previous)} ${paper.explanation}`
          : `「${previous.title}」 얘기예요. ${paper.explanation}`]
      : [previous.summary, ...(previous.role ? [`제 역할은 ${previous.role}였어요.`] : previous.details.slice(0, 1))];
    return base([previous], paragraphs, ["그 기록의 출처를 보고 싶어"]);
  }
  const interviewIds = preferredRecordId
    ? []
    : interviewTopics(addressed, context);
  if (interviewIds.length) {
    const selected = interviewIds.flatMap((id) =>
      records.filter((record) => record.id === id),
    );
    if (selected.length)
      return base(
        selected,
        selected.flatMap((record) => [record.summary, ...record.details]),
        interviewSuggestions,
        true,
        "interview",
      );
  }
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
  if (!preferredRecordId && !precise.length && asksForRecentProject(query)) {
    const work = records.filter((record) => record.project && record.projectDate)
      .sort((a, b) => b.projectDate!.day.localeCompare(a.projectDate!.day))[0];
    if (work) {
      const date = work.projectDate!;
      const when = date.updated ? `공개 저장소의 최근 업데이트 날짜는 ${date.day}입니다.` : `프로젝트 기록 날짜는 ${date.day}입니다.`;
      return base([work], [`최근 공개 프로젝트는 「${work.title}」예요. ${work.summary}`, when],
        ["좀 더 자세히 알려 줘", "그 프로젝트의 소스 링크는?"]);
    }
    const representative = records.find((record) => record.project);
    if (representative) return base([representative], [`공개 CV에 있는 프로젝트 중 하나는 「${representative.title}」예요. ${representative.summary}`, "작업 날짜는 CV에 따로 적혀 있지 않아요."], ["좀 더 자세히 알려 줘"]);
  }
  if (!preferredRecordId && !precise.length && asksForPapers(query)) {
    const papers = records.filter((item) => item.publication)
      .sort((a, b) => Number(b.publication!.year) - Number(a.publication!.year));
    const all = /전부|모두|전체|목록/.test(query);
    const selected = all ? papers : papers.filter((item) => item.publication!.year === papers[0]?.publication?.year).slice(0, 3);
    if (selected.length) {
      const sharedStatus = selected.length > 1 && selected.every((item) => item.publication!.status === selected[0].publication!.status);
      const statusText = (status: string) => status === "게재 확정 · 발행 예정" ? "게재가 확정됐고 발행 예정이에요."
        : status === "게재" ? "게재된 논문이에요." : status;
      const descriptions = selected.map((item) =>
        `${item.publication!.year}년 「${item.title}」에 ${describePaperRole(item)}` +
        (sharedStatus ? "" : ` ${statusText(item.publication!.status)}`),
      );
      if (sharedStatus) descriptions.push(`이 논문들은 모두 ${statusText(selected[0].publication!.status)}`);
      return base(selected, descriptions, ["첫 번째 논문을 쉽게 설명해 줘", "그 연구에서 맡은 역할은?"]);
    }
  }
  const candidates = precise.length ? precise : topics;
  let selected = candidates
    .slice(0, 2)
    .filter(
      (item, index) => index === 0 || item.score >= candidates[0].score - 3,
    )
    .map((item) => item.record);
  if (studyLocation)
    selected = records.filter((item) => item.id === "education");
  const intro =
    asksForIntroduction(query) ||
    addressed === "@" ||
    aboutOwner.test(addressed);
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
      return record.project && record.details.length
        ? [`「${record.title}」 얘기예요. ${record.details[0]}`, ...record.details.slice(1, 3)]
        : [record.summary, ...record.details.slice(0, 3)];
    return [
      record.publication ? `「${record.title}」을 연구했어요. ${record.publication.explanation}` : record.summary,
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
  if (selected.every((record) => record.id.startsWith("interview-")))
    return base(
      selected,
      paragraphs.slice(0, 5),
      interviewSuggestions,
      true,
      "interview",
    );
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
    // A fluent-sounding fragment can still leave the reader with only a source link.
    const stems = (value: string) => normalize(value).split(" ").filter((word) => word.length >= 2)
      .map((word) => word.slice(0, Math.min(3, word.length)));
    const referenceWords = new Set(stems(grounding));
    const sharedWords = new Set(stems(text).filter((word) => referenceWords.has(word)));
    if (sharedWords.size < 2 || /(?:모르겠네|잘 모르겠어|모르겠습니다)[.!?\s]*$/.test(text.trim())) return false;
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
