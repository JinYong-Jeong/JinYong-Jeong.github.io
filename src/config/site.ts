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
    bio: "LLM과 Federated Learning을 중심으로 연구하고, 실험하고, 구현하며 배운 내용을 재현 가능한 기록으로 남깁니다.",
    longBio:
      "모델을 더 잘 이해하기 위해 논문을 읽고, 작은 실험을 설계하고, 구현 과정에서 마주친 문제를 기록합니다. 이 블로그는 공부한 내용을 정리하는 공간이면서, 나중에 같은 문제를 다시 풀 때 바로 참고할 수 있는 연구 노트입니다."
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
      description: "분산 학습, client sampling, domain shift, Flower 실험"
    },
    "paper-review": {
      label: "Paper Review",
      description: "논문 핵심 아이디어, 실험, 구현 관점 정리"
    },
    "experiment-log": {
      label: "Experiment Log",
      description: "실험 설정, 결과, 실패 원인, 다음 action"
    },
    development: {
      label: "Development",
      description: "개발 환경, 자동화, 도구, 블로그 운영 기록"
    }
  },
  techStack: [
    "Python",
    "PyTorch",
    "Hugging Face",
    "Flower",
    "LoRA",
    "PEFT",
    "Docker",
    "Linux",
    "Git",
    "Astro"
  ],
  focusAreas: [
    "Federated LLM fine-tuning",
    "LLM evaluation automation",
    "PEFT/LoRA 실험 재현",
    "실험 로그와 결과 시각화"
  ],
  socials: [
    { label: "GitHub", href: "https://github.com/JinYong-Jeong", icon: "github" },
    { label: "Email", href: "mailto:your-email@example.com", icon: "mail" },
    { label: "LinkedIn", href: "https://www.linkedin.com/", icon: "linkedin" },
    { label: "RSS", href: "/rss.xml", icon: "rss" }
  ]
} as const;

export type CategoryKey = keyof typeof site.categories;
