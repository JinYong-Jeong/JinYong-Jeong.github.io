/**
 * CV content, separated from presentation.
 * Source: the owner's LinkedIn profile, publications and honors, checked 2026-11-17.
 * CCL start date comes from the existing site profile. Conference acceptance is
 * deliberately distinguished from publication; unknown award dates stay unknown.
 */
export interface CvEducation {
  school: string;
  degree: string;
  period: string;
  note: string;
}

export interface CvExperience {
  period: string;
  organization: string;
  role: string;
  summary: string;
  details: readonly string[];
  href: string;
}

export interface CvPublication {
  id: string;
  year: string;
  type: string;
  status: string;
  role: string;
  title: string;
  korean: string;
  venue: string;
  award: string;
  description: string;
  href: string;
  linkLabel: string;
}

export interface CvAward {
  date: string;
  title: string;
  organization: string;
  detail: string;
}

export interface CvWork {
  id: string;
  category: "research" | "community" | "engineering";
  categoryLabel: string;
  title: string;
  subtitle: string;
  description: string;
  tags: readonly string[];
  href: string;
  linkLabel: string;
}

export interface CvProfile {
  name: string;
  koreanName: string;
  role: string;
  affiliation: string;
  intro: string;
  description: string;
  email: string;
  education: CvEducation;
  experience: readonly CvExperience[];
  publications: readonly CvPublication[];
  awards: readonly CvAward[];
  work: readonly CvWork[];
}

export const cv = {
  name: "Jinyong Jeong",
  koreanName: "정진용",
  role: "Undergraduate Researcher",
  affiliation: "Cognitive Computing Lab · Gachon University",
  intro:
    "가천대학교에서 컴퓨터공학을 전공하며 LLM과 AI 에이전트를 연구합니다. 에이전트가 도구를 사용해 답을 찾는 과정을 직접 구현하고 검증합니다.",
  description:
    "LLM이 외부 도구와 데이터를 활용하는 과정을 연구합니다. 개인건강데이터 연구에서는 예측 모델을 에이전트의 도구로 연결하고, 예측 결과를 사용자의 맥락에 맞게 설명하는 시스템을 구현했습니다.",
  email: "wjdwlsdyd5373@gmail.com",
  education: {
    school: "Gachon University",
    degree: "컴퓨터공학 학사 과정",
    period: "2022.03 — 2028.02 (졸업 예정)",
    note: "가천대학교 컴퓨터공학 전공",
  },
  experience: [
    {
      period: "2025.10 — Present",
      organization: "Cognitive Computing Lab",
      role: "학부연구생",
      summary: "연합학습, 개인건강데이터와 AI Agent 시스템 연구.",
      details: [
        "가천대학교 Cognitive Computing Lab에서 연합학습과 AI Agent를 연구합니다.",
        "개인건강데이터를 로컬에 유지하면서 학습한 예측 모델을 AI Agent의 도구로 연결하는 시스템을 연구했습니다.",
        "연합학습 모델의 공유·활용·개선을 연결하는 FedOps 1.3 개발에 참여했습니다.",
      ],
      href: "https://www.linkedin.com/company/cognitive-computing-lab/",
    },
    {
      period: "2025.02 — Present",
      organization: "A.ing",
      role: "인공지능 학술동아리 회원",
      summary: "가천대학교 인공지능 학술동아리에서 학습과 개발 활동.",
      details: [
        "가천대학교 인공지능 학술동아리 A.ing에서 활동하고 있습니다.",
        "2026년 봄 ResNet 주니어 스터디 교육자료 제작에 참여했습니다. 논문을 읽고 잔차 블록을 구현한 뒤 CIFAR-10으로 실험하는 과정입니다.",
      ],
      href: "https://github.com/aing-gachon/26-Spring-ResNet-Study",
    },
  ],
  publications: [
    {
      id: "system-1",
      year: "2026",
      type: "Conference",
      status: "게재 확정 · 발행 예정",
      role: "제1저자 · 구두 발표",
      title: "Adapting Frozen LLMs through System 1 Fine-Tuning",
      korean: "온디바이스 환경에서 System 1 학습을 통한 동결 LLM의 간접 튜닝",
      venue: "한국데이터사이언스학회 추계종합학술대회",
      award: "우수논문상",
      description:
        "경량 System 1 판단 모델을 학습해 생성 LLM의 가중치를 갱신하지 않고 응답을 유도하는 간접 튜닝 방법입니다. 개인화 리뷰 생성 과제에서 평가하고 Galaxy S24 Ultra에서 경량 판단 모델의 온디바이스 학습을 검증했습니다.",
      href: "https://www.linkedin.com/in/jinyongjeong/details/publications/",
      linkLabel: "연구 소개",
    },
    {
      id: "gpu-scheduling",
      year: "2026",
      type: "Conference",
      status: "게재 확정 · 발행 예정",
      role: "제2저자 · 포스터 발표",
      title:
        "Resource-Aware GPU Scheduling for Co-located Federated Learning and Institutional Workloads",
      korean: "연합학습과 기관 업무의 GPU 공유를 위한 자원 인식형 스케줄링",
      venue: "한국데이터사이언스학회 추계종합학술대회",
      award: "우수논문상",
      description:
        "연합학습과 기관 업무가 하나의 GPU를 공유할 때 기관 업무를 우선 처리하는 스케줄링을 제안했습니다. GPU 메모리가 부족할 때 학습 상태를 호스트 RAM으로 이관하고, 업무 처리 후 학습을 재개합니다.",
      href: "https://www.linkedin.com/in/jinyongjeong/details/publications/",
      linkLabel: "연구 소개",
    },
    {
      id: "inference-caching",
      year: "2026",
      type: "Conference",
      status: "게재 확정 · 발행 예정",
      role: "제2저자 · 포스터 발표",
      title:
        "Per-Model Inference Result Caching for Efficient Re-execution of Multi-Model AI Services after Federated Learning Model Updates",
      korean:
        "연합학습 모델 갱신 후 다중 모델 AI 서비스의 재실행 효율화를 위한 모델별 추론 결과 캐싱",
      venue: "한국데이터사이언스학회 추계종합학술대회",
      award: "",
      description:
        "다중 모델 병리 분석 AI 서비스에서 개별 모델 갱신 후 발생하는 중복 추론을 줄이는 방법을 연구했습니다. 모델 버전과 입력 패치를 기준으로 유효한 캐시를 재사용하고, 평가한 실험에서 전체 재분석과 출력이 일치함을 확인했습니다.",
      href: "https://www.linkedin.com/in/jinyongjeong/details/publications/",
      linkLabel: "연구 소개",
    },
    {
      id: "cumulative-token-alignment",
      year: "2026",
      type: "Conference",
      status: "게재",
      role: "제1저자",
      title:
        "Research on Cumulative Token-Usage Alignment for LLM Fine-Tuning in Federated Learning",
      korean:
        "연합학습 환경의 LLM 파인튜닝을 위한 누적 토큰 학습량 정합화 기반 학습 방법 연구",
      venue: "한국데이터사이언스학회 하계종합학술대회 논문집 · 273–276쪽",
      award: "장려논문상",
      description:
        "연합학습에서 통신 라운드가 늘어도 총 학습량을 일정하게 유지하도록 각 클라이언트의 학습 샘플을 라운드별로 나누었습니다. 의료·금융 데이터를 따로 학습할 때와 함께 학습할 때, 누적 토큰 학습량을 맞춘 조건에서 중앙집중식 LLM 파인튜닝과 비교했습니다.",
      href: "https://www.koreadatascience.org/uploads/proceedings/pdfs/1781785188298-504800265.pdf#page=273",
      linkLabel: "논문 읽기",
    },
    {
      id: "health-agent",
      year: "2025",
      type: "Journal · KCI",
      status: "게재",
      role: "제1저자",
      title:
        "Research on a Privacy-Preserving AI-Agent System for Personal Health Data Based on Federated Learning",
      korean:
        "연합학습 기반 개인건강데이터 프라이버시 보호형 AI-Agent 시스템 연구",
      venue: "The Korea Journal of BigData · 10(2), 229–240",
      award: "",
      description:
        "웨어러블 원본 건강데이터를 각 클라이언트에 유지하면서 연합학습한 다섯 가지 건강 예측 모델을 로컬 AI Agent의 도구로 통합했습니다. 메모리, RAG 기반 검색과 ReAct 추론을 결합해 예측값을 개인 맥락에 맞춘 설명으로 연결했습니다.",
      href: "https://doi.org/10.36498/kbigdt.2025.10.2.229",
      linkLabel: "논문 읽기",
    },
  ],
  awards: [
    {
      date: "2026.11",
      title: "우수논문상",
      organization: "한국데이터사이언스학회 추계종합학술대회",
      detail: "System 1 학습을 통한 동결 LLM의 간접 튜닝 · 제1저자, 구두 발표",
    },
    {
      date: "2026.11",
      title: "우수논문상",
      organization: "한국데이터사이언스학회 추계종합학술대회",
      detail:
        "연합학습과 기관 업무의 GPU 공유를 위한 자원 인식형 스케줄링 · 제2저자",
    },
    {
      date: "2026.06",
      title: "장려논문상",
      organization: "한국데이터사이언스학회 하계종합학술대회",
      detail:
        "연합학습 환경의 LLM 파인튜닝을 위한 누적 토큰 학습량 정합화 기반 학습 방법 연구 · 제1저자",
    },
    {
      date: "—",
      title: "가천인재상",
      organization: "가천대학교",
      detail: "Gachon Talent Award",
    },
  ],
  work: [
    {
      id: "fedops",
      category: "research",
      categoryLabel: "Research & engineering",
      title: "FedOps 1.3",
      subtitle: "Federated AI AgentOps",
      description:
        "연합학습으로 만든 모델을 AI Agent에서 사용하고 다시 개선하는 플랫폼 개발에 참여했습니다. Registry의 모델 공유와 Agent Studio의 도구 구성·서비스 연결을 이어가는 팀 프로젝트입니다.",
      tags: ["Federated Learning", "AI Agent", "Flower"],
      href: "https://www.linkedin.com/feed/update/urn:li:activity:7513116839154040832/",
      linkLabel: "개발 참여 기록",
    },
    {
      id: "aing",
      category: "community",
      categoryLabel: "Community",
      title: "ResNet 주니어 스터디",
      subtitle: "A.ing · 2026 Spring",
      description:
        "A.ing에서 동료들과 ResNet 교육자료를 만들었습니다. 논문 가이드와 퀴즈로 잔차 연결을 이해하고, 빈칸 노트북에서 PyTorch로 ResNet을 구현한 뒤 CIFAR-10 분류 실험으로 결과를 비교합니다.",
      tags: ["ResNet", "PyTorch", "CIFAR-10"],
      href: "https://github.com/aing-gachon/26-Spring-ResNet-Study",
      linkLabel: "교육자료 보기",
    },
    {
      id: "portfolio",
      category: "engineering",
      categoryLabel: "Engineering",
      title: "Personal portfolio",
      subtitle: "An interactive CV",
      description:
        "정해진 순서로 이력을 읽을 때 놓치기 쉬운 활동 사이의 연결을 보여주고 싶었습니다. 이 사이트에서는 책장을 넘겨 관심 있는 경험을 고르고, 그 페이지에서 제 역할을 묻거나 원문을 열어볼 수 있습니다.",
      tags: ["Astro", "TypeScript", "Design system"],
      href: "https://github.com/JinYong-Jeong/JinYong-Jeong.github.io",
      linkLabel: "소스코드",
    },
  ],
} as const satisfies CvProfile;
