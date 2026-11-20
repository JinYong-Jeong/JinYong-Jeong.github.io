export const site = {
  name: "Jinyong Jeong",
  shortName: "JJ",
  title: "Jinyong Jeong | Interactive CV",
  description:
    "정진용의 인터랙티브 CV. 책장을 넘기며 가천대학교에서의 학업과 연구, 개발 프로젝트, 동아리 활동을 살펴보고 공개 기록을 바탕으로 대화할 수 있습니다.",
  url: "https://jinyong-jeong.github.io",
  locale: "ko_KR",
  author: {
    name: "Jinyong Jeong",
    displayName: "Jinyong",
    role: "Undergraduate Researcher",
    location: "Seoul, Korea",
    avatar: "https://avatars.githubusercontent.com/u/174023460?v=4",
    bio: "가천대학교에서 LLM과 AI 에이전트를 공부하고 연구합니다.",
    longBio:
      "LLM과 AI 에이전트를 연구하며, 모델이 도구를 사용해 답을 찾는 과정을 직접 구현합니다. 연구와 개발 이력, 실험에서 배운 내용을 이곳에 기록합니다."
  },
  nav: [
    { label: "CV", href: "/" },
    { label: "Work", href: "/projects/" },
    { label: "Writing", href: "/blog/" },
    { label: "Chat", href: "/chat/" }
  ],
  categories: {
    llm: {
      label: "LLM",
      description: "모델 구조, fine-tuning, inference, evaluation 기록"
    },
    "federated-learning": {
      label: "Federated Learning",
      description: "분산 학습, client sampling, domain shift, Flower 실험 기록"
    },
    "paper-review": {
      label: "Paper Review",
      description: "논문 핵심 아이디어와 구현 관점을 정리한 리뷰"
    },
    "experiment-log": {
      label: "Experiment Log",
      description: "실험 설정, 결과, 실패 원인, 다음 액션을 기록한 로그"
    },
    development: {
      label: "Development",
      description: "개발 환경, 자동화, 도구, 블로그 운영 관련 기록"
    }
  },
  techStack: [
    "Python",
    "PyTorch",
    "Hugging Face",
    "Flower",
    "Docker",
    "Linux",
    "Git",
    "VS Code"
  ],
  focusAreas: [
    "Federated LLM fine-tuning",
    "LLM evaluation automation",
    "PEFT/LoRA 실험 재현",
    "실험 로그와 결과 시각화"
  ],
  socials: [
    { label: "GitHub", href: "https://github.com/JinYong-Jeong", icon: "github" },
    { label: "Email", href: "mailto:wjdwlsdyd5373@gmail.com", icon: "mail" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/jinyongjeong", icon: "linkedin" }
  ],
  achievements: [
    {
      title: "학부연구생",
      organization: "Gachon Cognitive Computing Lab",
      period: "2025.10 - Present",
      note: "개인건강데이터, 프라이버시 보호, AI-Agent 시스템을 중심으로 연구를 진행 중입니다."
    },
    {
      title: "연합학습 기반 개인건강데이터 프라이버시 보호형 AI-Agent 시스템 연구",
      organization: "한국빅데이터학회(KCI)",
      period: "1저자",
      note: "정진용, 송인서, 이강윤"
    }
  ]
} as const;

export type CategoryKey = keyof typeof site.categories;
