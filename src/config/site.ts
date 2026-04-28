export const site = {
  name: "Jinyong Jeong",
  shortName: "JJ",
  title: "Jinyong Jeong | AI Research & Development Blog",
  description:
    "LLM, Federated Learning, 논문 리뷰, 실험 로그를 기록하는 개인 개발 블로그입니다.",
  url: "https://jinyong-jeong.github.io",
  locale: "ko_KR",
  author: {
    name: "Jinyong Jeong",
    displayName: "Jinyong",
    role: "Developer · Researcher · Builder",
    location: "Seoul, Korea",
    avatar: "https://avatars.githubusercontent.com/u/174023460?v=4",
    bio: "LLM과 Federated Learning을 중심으로 연구하고, 실험하고, 구현하면서 배운 내용을 재현 가능한 기록으로 남깁니다.",
    longBio:
      "논문을 읽고 끝내지 않고 직접 구현하고 검증하는 편입니다. 모델 성능 자체보다 왜 그런 결과가 나왔는지, 다음 실험에서 무엇을 바꿔야 하는지까지 남기는 기록을 선호합니다. 이 블로그는 그 과정을 쌓아두는 연구 노트이자 개발 아카이브입니다."
  },
  nav: [
    { label: "Home", href: "/" },
    { label: "Blog", href: "/blog/" },
    { label: "Projects", href: "/projects/" },
    { label: "About", href: "/about/" }
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
