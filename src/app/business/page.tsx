"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

type Lang = "en" | "ja" | "ko" | "zh";
type DemoTab = "sales" | "cs" | "negotiation";

const languages: Array<{ code: Lang; label: string; aria: string }> = [
  { code: "en", label: "EN", aria: "English" },
  { code: "ja", label: "日本語", aria: "Japanese" },
  { code: "ko", label: "한국어", aria: "Korean" },
  { code: "zh", label: "中文", aria: "Chinese" },
];

const langAliases: Record<string, Lang> = {
  en: "en",
  ja: "ja",
  jp: "ja",
  ko: "ko",
  kr: "ko",
  zh: "zh",
  cn: "zh",
  tw: "zh",
};

const baseUrl = "https://www.sayok.chat/business";

const typographyByLang: Record<
  Lang,
  {
    body: string;
    display: string;
    heading: CSSProperties;
    heroHeading?: CSSProperties;
    price: CSSProperties;
  }
> = {
  en: {
    body: "'DM Sans', Arial, sans-serif",
    display: "'DM Serif Display', Georgia, serif",
    heading: {
      fontFamily: "'DM Serif Display', Georgia, serif",
      lineHeight: 0.98,
      fontWeight: 400,
    },
    price: {
      fontFamily: "'DM Serif Display', Georgia, serif",
      fontWeight: 400,
    },
  },
  ja: {
    body: "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif",
    display: "'Noto Serif JP', 'Hiragino Mincho ProN', 'Yu Mincho', serif",
    heading: {
      fontFamily: "'Noto Serif JP', 'Hiragino Mincho ProN', 'Yu Mincho', serif",
      lineHeight: 1.22,
      fontWeight: 700,
      wordBreak: "keep-all",
      overflowWrap: "break-word",
    },
    heroHeading: {
      fontSize: "clamp(34px, 4.25vw, 58px)",
      maxWidth: 620,
    },
    price: {
      fontFamily: "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif",
      fontWeight: 800,
    },
  },
  ko: {
    body: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    display: "'Noto Serif KR', 'AppleMyungjo', serif",
    heading: {
      fontFamily: "'Noto Serif KR', 'AppleMyungjo', serif",
      lineHeight: 1.18,
      fontWeight: 700,
      wordBreak: "keep-all",
      overflowWrap: "break-word",
    },
    heroHeading: {
      fontSize: "clamp(34px, 4.4vw, 60px)",
      maxWidth: 620,
    },
    price: {
      fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
      fontWeight: 800,
    },
  },
  zh: {
    body: "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    display: "'Noto Serif SC', 'Songti SC', serif",
    heading: {
      fontFamily: "'Noto Serif SC', 'Songti SC', serif",
      lineHeight: 1.18,
      fontWeight: 700,
      wordBreak: "keep-all",
      overflowWrap: "break-word",
    },
    heroHeading: {
      fontSize: "clamp(34px, 4.4vw, 60px)",
      maxWidth: 620,
    },
    price: {
      fontFamily: "'Noto Sans SC', 'PingFang SC', sans-serif",
      fontWeight: 800,
    },
  },
};

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#fbfdff",
    color: "#1a1a18",
    fontFamily: "'DM Sans', Arial, sans-serif",
  },
  container: {
    width: "min(1120px, calc(100% - 32px))",
    margin: "0 auto",
  },
  nav: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    background: "rgba(251, 253, 255, 0.94)",
    backdropFilter: "blur(18px)",
    borderBottom: "1px solid rgba(4, 44, 83, 0.09)",
  },
  navInner: {
    minHeight: 76,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    flexWrap: "wrap",
    padding: "14px 0",
  },
  brand: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    color: "#042C53",
    fontWeight: 800,
    fontSize: 22,
    textDecoration: "none",
  },
  navLinks: {
    display: "flex",
    alignItems: "center",
    gap: 18,
    flexWrap: "wrap",
    color: "#51504b",
    fontSize: 14,
  },
  languageGroup: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: 4,
    border: "1px solid rgba(4, 44, 83, 0.12)",
    borderRadius: 999,
    background: "#ffffff",
  },
  section: {
    padding: "92px 0",
  },
  eyebrow: {
    color: "#185FA5",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    fontSize: 13,
    marginBottom: 14,
  },
  heading: {
    fontFamily: "'DM Serif Display', Georgia, serif",
    color: "#042C53",
    fontSize: "clamp(36px, 5vw, 68px)",
    lineHeight: 1.04,
    letterSpacing: 0,
    margin: "0 0 22px",
  },
  subheading: {
    color: "#4d4c47",
    fontSize: 18,
    lineHeight: 1.75,
    margin: 0,
  },
  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    padding: "0 20px",
    borderRadius: 999,
    border: "1px solid #185FA5",
    background: "#185FA5",
    color: "#ffffff",
    fontWeight: 800,
    textDecoration: "none",
    cursor: "pointer",
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    padding: "0 20px",
    borderRadius: 999,
    border: "1px solid rgba(4, 44, 83, 0.18)",
    background: "#ffffff",
    color: "#042C53",
    fontWeight: 800,
    textDecoration: "none",
  },
  card: {
    background: "#ffffff",
    border: "1px solid rgba(4, 44, 83, 0.10)",
    borderRadius: 8,
    boxShadow: "0 24px 70px rgba(4, 44, 83, 0.10)",
  },
};

const copy = {
  en: {
    metaTitle: "SayOK Business | Multilingual AI communication for teams",
    nav: {
      features: "Features",
      useCases: "Use cases",
      pricing: "Pricing",
      faq: "FAQ",
      cta: "Contact sales",
    },
    hero: {
      eyebrow: "SayOK Business",
      title: "AI communication quality control for global teams.",
      body: "SayOK Business helps sales, customer support, and operations teams rewrite messages before they are sent, making every reply clearer, warmer, and locally natural across English, Japanese, Korean, and Chinese.",
      primary: "Talk to sales",
      secondary: "See how it works",
      statOne: "4 languages",
      statTwo: "3 workflow modes",
      statThree: "Team-ready",
    },
    logos: {
      label: "Built for teams that communicate across borders",
      items: ["SaaS", "E-commerce", "Travel", "Gaming", "Fintech", "Education"],
    },
    demo: {
      title: "Live message optimizer",
      before: "Before",
      after: "After",
      tabs: {
        sales: "Sales Email",
        cs: "CS Reply",
        negotiation: "Negotiation",
      },
      content: {
        sales: {
          before:
            "Hi, just checking if you looked at our proposal. Please reply when you can.",
          after:
            "Hi Alex, I hope you are doing well. I wanted to follow up on the proposal we shared last week and see whether it aligns with your team’s priorities. Happy to answer any questions or adjust the plan if helpful.",
        },
        cs: {
          before:
            "We cannot refund because it is outside the policy. Please check the terms.",
          after:
            "Thank you for reaching out. I understand how frustrating this must feel. Your order is outside our standard refund window, but I would be happy to review the details and look for the best available option.",
        },
        negotiation: {
          before:
            "That price is too low. We need a better offer to continue.",
          after:
            "Thank you for sharing the offer. To move forward sustainably, we would need to revisit the pricing. If there is room to adjust the terms, I believe we can find a structure that works for both sides.",
        },
      },
    },
    features: {
      eyebrow: "Features",
      title: "Make every business message ready to send.",
      body: "SayOK adds a final communication layer before messages leave your company.",
      items: [
        {
          icon: "ti-language",
          title: "Multilingual rewriting",
          body: "Rewrite and localize messages in English, Japanese, Korean, and Chinese without losing intent.",
        },
        {
          icon: "ti-mood-smile",
          title: "Tone calibration",
          body: "Choose a tone that fits the situation: polite, concise, friendly, persuasive, or apologetic.",
        },
        {
          icon: "ti-shield-check",
          title: "Brand-safe replies",
          body: "Help teams avoid harsh phrasing, ambiguity, and avoidable misunderstandings before sending.",
        },
        {
          icon: "ti-bolt",
          title: "Fast daily workflow",
          body: "Paste, improve, and send in seconds without changing the tools your team already uses.",
        },
        {
          icon: "ti-users",
          title: "Team consistency",
          body: "Give every teammate a reliable second pair of eyes for important external communication.",
        },
        {
          icon: "ti-chart-line",
          title: "Conversion-minded copy",
          body: "Improve clarity and persuasion for sales follow-ups, renewal messages, and partner outreach.",
        },
      ],
    },
    useCases: {
      eyebrow: "Use cases",
      title: "Built for the messages that affect revenue and trust.",
      items: [
        {
          title: "Sales and partnerships",
          body: "Turn rough follow-ups, proposals, and negotiation notes into polished outreach that keeps momentum moving.",
        },
        {
          title: "Customer support",
          body: "Transform sensitive replies into empathetic, policy-aware responses that reduce escalation risk.",
        },
        {
          title: "Global operations",
          body: "Help distributed teams communicate with customers, vendors, and colleagues in locally natural language.",
        },
      ],
    },
    testimonials: {
      eyebrow: "Testimonials",
      title: "Teams use SayOK to reduce communication risk.",
      items: [
        {
          quote:
            "SayOK helps our team sound thoughtful even when we are moving quickly. It is now part of our sales follow-up routine.",
          name: "Mika Tanaka",
          role: "Head of Revenue, SaaS startup",
        },
        {
          quote:
            "Support replies that used to feel blunt now sound calm and human. It saves time and reduces back-and-forth.",
          name: "Daniel Kim",
          role: "Customer Experience Lead",
        },
        {
          quote:
            "The multilingual output is especially useful for partner messages. It keeps the nuance we care about.",
          name: "Lin Chen",
          role: "Global Operations Manager",
        },
      ],
    },
    pricing: {
      eyebrow: "Pricing",
      title: "Choose the plan that matches your team.",
      period: "per seat / month",
      cta: "Contact sales",
      plans: [
        {
          name: "Starter",
          price: "$69",
          description: "For small teams improving daily customer messages.",
          features: ["Up to 5 seats", "EN/JA/KO/ZH rewriting", "Demo modes", "Email support"],
        },
        {
          name: "Business",
          price: "$199",
          description: "For growing teams standardizing external communication.",
          features: ["Up to 25 seats", "Shared team guidelines", "Priority support", "Usage review"],
        },
        {
          name: "Enterprise",
          price: "Custom",
          description: "For organizations with advanced workflow and security needs.",
          features: ["Custom seats", "Security review", "Dedicated onboarding", "Custom terms"],
        },
      ],
    },
    faq: {
      eyebrow: "FAQ",
      title: "Questions teams ask before adopting SayOK.",
      items: [
        {
          q: "Which languages are supported?",
          a: "SayOK Business supports English, Japanese, Korean, and Chinese for the landing experience and core communication workflows.",
        },
        {
          q: "Does SayOK replace our CRM or helpdesk?",
          a: "No. SayOK is designed as a pre-send communication layer, so teams can improve copy before pasting it into their existing tools.",
        },
        {
          q: "Can we use it for sensitive customer replies?",
          a: "Yes. It is especially useful for turning direct or emotional drafts into calm, respectful replies while preserving policy intent.",
        },
        {
          q: "Do you offer enterprise plans?",
          a: "Yes. Enterprise plans can include custom onboarding, security review, procurement support, and workflow guidance.",
        },
      ],
    },
    cta: {
      title: "Bring clearer multilingual communication to your team.",
      body: "Contact us to discuss seats, workflows, onboarding, and the right plan for your organization.",
      button: "Email business@sayok.chat",
    },
    footer: {
      tagline: "Make your message better before you send.",
      contact: "Contact",
      rights: "All rights reserved.",
    },
  },
  ja: {
    metaTitle: "SayOK Business | グローバルチームのための多言語AIコミュニケーション",
    nav: {
      features: "機能",
      useCases: "活用シーン",
      pricing: "料金",
      faq: "FAQ",
      cta: "営業に相談",
    },
    hero: {
      eyebrow: "SayOK Business",
      title: "グローバルチームのためのAIコミュニケーション品質管理。",
      body: "SayOK Businessは、営業・カスタマーサポート・オペレーションチームが送信前のメッセージをより明確で、あたたかく、現地の言語感覚に合った表現へ整えるためのBtoB向けサービスです。英語・日本語・韓国語・中国語に対応しています。",
      primary: "営業に相談する",
      secondary: "仕組みを見る",
      statOne: "4言語対応",
      statTwo: "3つの業務モード",
      statThree: "チーム利用対応",
    },
    logos: {
      label: "国境を越えてコミュニケーションするチームのために",
      items: ["SaaS", "EC", "旅行", "ゲーム", "Fintech", "教育"],
    },
    demo: {
      title: "メッセージ最適化デモ",
      before: "Before",
      after: "After",
      tabs: {
        sales: "営業メール",
        cs: "CS返信",
        negotiation: "交渉",
      },
      content: {
        sales: {
          before:
            "こんにちは。提案書は見ましたか？確認できたら返信してください。",
          after:
            "〇〇様、お世話になっております。先週お送りしたご提案について、貴社の優先事項に沿う内容になっているか確認したくご連絡いたしました。ご不明点や調整したい点がございましたら、いつでもお知らせください。",
        },
        cs: {
          before:
            "規約外なので返金できません。利用規約を確認してください。",
          after:
            "お問い合わせありがとうございます。ご不便をおかけしており申し訳ございません。今回のご注文は通常の返金期間を過ぎておりますが、詳細を確認したうえで、可能な対応がないか改めてご案内いたします。",
        },
        negotiation: {
          before:
            "その価格は安すぎます。続けるにはもっと良い条件が必要です。",
          after:
            "ご提案いただきありがとうございます。継続的に良い形で進めるためには、価格条件について再度ご相談できればと考えております。調整の余地がございましたら、双方にとって納得感のある形を一緒に検討できれば幸いです。",
        },
      },
    },
    features: {
      eyebrow: "Features",
      title: "すべてのビジネスメッセージを、送信できる品質へ。",
      body: "SayOKは、企業から外部へ出るメッセージの直前に、最後のコミュニケーション品質レイヤーを追加します。",
      items: [
        {
          icon: "ti-language",
          title: "多言語リライト",
          body: "英語・日本語・韓国語・中国語で、意図を保ちながら自然な表現へ書き換えます。",
        },
        {
          icon: "ti-mood-smile",
          title: "トーン調整",
          body: "丁寧、簡潔、親しみやすい、説得力のある、謝罪を含むなど、状況に合うトーンへ整えます。",
        },
        {
          icon: "ti-shield-check",
          title: "ブランドを守る返信",
          body: "きつい表現、曖昧さ、不要な誤解を送信前に減らし、安心して返信できる状態にします。",
        },
        {
          icon: "ti-bolt",
          title: "日常業務にすぐ使える",
          body: "貼り付けて、改善して、送るだけ。既存のCRMやメール、チャット運用を変えずに導入できます。",
        },
        {
          icon: "ti-users",
          title: "チーム品質の平準化",
          body: "重要な外部コミュニケーションに、全メンバーが頼れる第二のチェックを提供します。",
        },
        {
          icon: "ti-chart-line",
          title: "成果につながる文章",
          body: "営業フォロー、更新案内、パートナー連絡などの明確さと説得力を高めます。",
        },
      ],
    },
    useCases: {
      eyebrow: "Use cases",
      title: "売上と信頼に影響するメッセージのために。",
      items: [
        {
          title: "営業・パートナー連携",
          body: "ラフなフォローアップ、提案、交渉メモを、次の会話につながる洗練された文面へ整えます。",
        },
        {
          title: "カスタマーサポート",
          body: "センシティブな返信を、共感と規約の両方を備えた返信へ変換し、エスカレーションリスクを下げます。",
        },
        {
          title: "グローバルオペレーション",
          body: "顧客、取引先、社内メンバーとのやりとりを、各言語で自然な表現に整えます。",
        },
      ],
    },
    testimonials: {
      eyebrow: "Testimonials",
      title: "チームはSayOKでコミュニケーションリスクを減らしています。",
      items: [
        {
          quote:
            "急いでいる時でも、チームの文章が思いやりのある印象になります。営業フォローの定番フローになりました。",
          name: "田中 美香",
          role: "SaaSスタートアップ Revenue責任者",
        },
        {
          quote:
            "以前は少し冷たく見えたサポート返信が、落ち着いて人間味のある文面になりました。時間短縮にもなっています。",
          name: "Daniel Kim",
          role: "Customer Experience Lead",
        },
        {
          quote:
            "パートナー向けの多言語メッセージで特に役立っています。大事にしたいニュアンスを保てるのが良いです。",
          name: "Lin Chen",
          role: "Global Operations Manager",
        },
      ],
    },
    pricing: {
      eyebrow: "Pricing",
      title: "チーム規模に合わせて選べる料金プラン。",
      period: "1シート / 月",
      cta: "相談する",
      plans: [
        {
          name: "Starter",
          price: "¥9,800",
          description: "日々の顧客メッセージを改善したい小規模チーム向け。",
          features: ["最大5シート", "EN/JA/KO/ZHリライト", "デモモード", "メールサポート"],
        },
        {
          name: "Business",
          price: "¥29,800",
          description: "外部コミュニケーションを標準化したい成長チーム向け。",
          features: ["最大25シート", "チームガイドライン共有", "優先サポート", "利用レビュー"],
        },
        {
          name: "Enterprise",
          price: "個別見積もり",
          description: "高度なワークフローやセキュリティ要件がある組織向け。",
          features: ["カスタムシート数", "セキュリティレビュー", "専任オンボーディング", "個別契約条件"],
        },
      ],
    },
    faq: {
      eyebrow: "FAQ",
      title: "導入前によくある質問。",
      items: [
        {
          q: "対応言語は何ですか？",
          a: "SayOK Businessは、ランディングページと主要なコミュニケーションワークフローで英語・日本語・韓国語・中国語に対応しています。",
        },
        {
          q: "CRMやヘルプデスクを置き換えるものですか？",
          a: "いいえ。SayOKは送信前のコミュニケーション品質レイヤーです。既存ツールに貼り付ける前の文章改善に使えます。",
        },
        {
          q: "センシティブな顧客返信にも使えますか？",
          a: "はい。直接的すぎる下書きや感情的な文面を、方針を保ちながら落ち着いた丁寧な返信へ整える用途に向いています。",
        },
        {
          q: "エンタープライズプランはありますか？",
          a: "はい。個別オンボーディング、セキュリティレビュー、購買プロセス対応、業務フロー設計などに対応できます。",
        },
      ],
    },
    cta: {
      title: "チームの多言語コミュニケーションを、もっと明確に。",
      body: "シート数、業務フロー、オンボーディング、最適なプランについてお気軽にご相談ください。",
      button: "business@sayok.chat に連絡",
    },
    footer: {
      tagline: "送る前に、メッセージをもっとよく。",
      contact: "お問い合わせ",
      rights: "All rights reserved.",
    },
  },
  ko: {
    metaTitle: "SayOK Business | 글로벌 팀을 위한 다국어 AI 커뮤니케이션",
    nav: {
      features: "기능",
      useCases: "활용 사례",
      pricing: "요금",
      faq: "FAQ",
      cta: "영업팀 문의",
    },
    hero: {
      eyebrow: "SayOK Business",
      title: "글로벌 팀을 위한 AI 커뮤니케이션 품질 관리.",
      body: "SayOK Business는 세일즈, 고객지원, 운영팀이 메시지를 보내기 전에 더 명확하고 따뜻하며 현지 언어에 자연스러운 표현으로 다듬도록 돕는 B2B 서비스입니다. 영어, 일본어, 한국어, 중국어를 지원합니다.",
      primary: "영업팀에 문의",
      secondary: "작동 방식 보기",
      statOne: "4개 언어",
      statTwo: "3가지 업무 모드",
      statThree: "팀 사용 지원",
    },
    logos: {
      label: "국경을 넘어 소통하는 팀을 위해",
      items: ["SaaS", "이커머스", "여행", "게임", "핀테크", "교육"],
    },
    demo: {
      title: "메시지 최적화 데모",
      before: "Before",
      after: "After",
      tabs: {
        sales: "세일즈 이메일",
        cs: "CS 답변",
        negotiation: "협상",
      },
      content: {
        sales: {
          before:
            "안녕하세요. 제안서 확인하셨나요? 가능할 때 답장 부탁드립니다.",
          after:
            "안녕하세요 Alex님, 잘 지내고 계시길 바랍니다. 지난주에 공유드린 제안서가 팀의 우선순위와 잘 맞는지 확인하고자 연락드립니다. 궁금한 점이 있거나 조정이 필요한 부분이 있다면 언제든 편하게 말씀해주세요.",
        },
        cs: {
          before:
            "정책상 환불이 불가능합니다. 약관을 확인해 주세요.",
          after:
            "문의해 주셔서 감사합니다. 불편을 겪으셨을 마음 충분히 이해합니다. 해당 주문은 일반 환불 기간이 지났지만, 세부 내용을 다시 확인한 뒤 가능한 최선의 옵션을 안내드리겠습니다.",
        },
        negotiation: {
          before:
            "그 가격은 너무 낮습니다. 계속하려면 더 좋은 제안이 필요합니다.",
          after:
            "제안해 주셔서 감사합니다. 지속 가능한 방식으로 함께 진행하기 위해서는 가격 조건을 다시 논의할 필요가 있을 것 같습니다. 조정 여지가 있다면 양측 모두에게 적합한 구조를 함께 찾아보고 싶습니다.",
        },
      },
    },
    features: {
      eyebrow: "Features",
      title: "모든 비즈니스 메시지를 바로 보낼 수 있는 품질로.",
      body: "SayOK는 회사 밖으로 나가는 메시지 직전에 마지막 커뮤니케이션 품질 레이어를 더합니다.",
      items: [
        {
          icon: "ti-language",
          title: "다국어 리라이팅",
          body: "의도를 잃지 않으면서 영어, 일본어, 한국어, 중국어로 자연스럽게 다시 씁니다.",
        },
        {
          icon: "ti-mood-smile",
          title: "톤 조정",
          body: "정중함, 간결함, 친근함, 설득력, 사과 등 상황에 맞는 톤으로 조정합니다.",
        },
        {
          icon: "ti-shield-check",
          title: "브랜드를 지키는 답변",
          body: "거친 표현, 모호함, 불필요한 오해를 보내기 전에 줄일 수 있도록 돕습니다.",
        },
        {
          icon: "ti-bolt",
          title: "빠른 일상 워크플로",
          body: "기존 도구를 바꾸지 않고 붙여넣고, 개선하고, 바로 보낼 수 있습니다.",
        },
        {
          icon: "ti-users",
          title: "팀 품질의 일관성",
          body: "중요한 외부 커뮤니케이션마다 팀원 모두에게 신뢰할 수 있는 두 번째 검토를 제공합니다.",
        },
        {
          icon: "ti-chart-line",
          title: "성과를 고려한 문장",
          body: "세일즈 후속 연락, 갱신 안내, 파트너 아웃리치의 명확성과 설득력을 높입니다.",
        },
      ],
    },
    useCases: {
      eyebrow: "Use cases",
      title: "매출과 신뢰에 영향을 주는 메시지를 위해.",
      items: [
        {
          title: "세일즈와 파트너십",
          body: "거친 후속 메일, 제안서 문구, 협상 메모를 다음 대화로 이어지는 세련된 메시지로 바꿉니다.",
        },
        {
          title: "고객지원",
          body: "민감한 답변을 공감과 정책을 모두 담은 응답으로 바꾸어 에스컬레이션 위험을 줄입니다.",
        },
        {
          title: "글로벌 운영",
          body: "고객, 공급사, 동료와의 커뮤니케이션을 각 언어에서 자연스러운 표현으로 정리합니다.",
        },
      ],
    },
    testimonials: {
      eyebrow: "Testimonials",
      title: "팀은 SayOK로 커뮤니케이션 리스크를 줄입니다.",
      items: [
        {
          quote:
            "빠르게 움직일 때도 팀의 메시지가 세심하게 들리도록 도와줍니다. 이제 세일즈 후속 연락 루틴의 일부가 되었습니다.",
          name: "Mika Tanaka",
          role: "SaaS 스타트업 Head of Revenue",
        },
        {
          quote:
            "딱딱하게 느껴지던 지원 답변이 차분하고 사람답게 바뀌었습니다. 시간도 절약되고 불필요한 왕복도 줄었습니다.",
          name: "Daniel Kim",
          role: "Customer Experience Lead",
        },
        {
          quote:
            "파트너 메시지를 다국어로 작성할 때 특히 유용합니다. 우리가 중요하게 생각하는 뉘앙스를 유지해 줍니다.",
          name: "Lin Chen",
          role: "Global Operations Manager",
        },
      ],
    },
    pricing: {
      eyebrow: "Pricing",
      title: "팀에 맞는 플랜을 선택하세요.",
      period: "좌석당 / 월",
      cta: "영업팀 문의",
      plans: [
        {
          name: "Starter",
          price: "$69",
          description: "일상적인 고객 메시지를 개선하려는 소규모 팀용.",
          features: ["최대 5석", "EN/JA/KO/ZH 리라이팅", "데모 모드", "이메일 지원"],
        },
        {
          name: "Business",
          price: "$199",
          description: "외부 커뮤니케이션을 표준화하려는 성장 팀용.",
          features: ["최대 25석", "팀 가이드라인 공유", "우선 지원", "사용량 리뷰"],
        },
        {
          name: "Enterprise",
          price: "Custom",
          description: "고급 워크플로와 보안 요구사항이 있는 조직용.",
          features: ["맞춤 좌석 수", "보안 검토", "전담 온보딩", "맞춤 계약 조건"],
        },
      ],
    },
    faq: {
      eyebrow: "FAQ",
      title: "도입 전에 팀이 자주 묻는 질문.",
      items: [
        {
          q: "어떤 언어를 지원하나요?",
          a: "SayOK Business는 랜딩 경험과 핵심 커뮤니케이션 워크플로에서 영어, 일본어, 한국어, 중국어를 지원합니다.",
        },
        {
          q: "CRM이나 헬프데스크를 대체하나요?",
          a: "아니요. SayOK는 보내기 전 커뮤니케이션 레이어로 설계되어 기존 도구에 붙여넣기 전에 문장을 개선하는 데 사용합니다.",
        },
        {
          q: "민감한 고객 답변에도 사용할 수 있나요?",
          a: "네. 직접적이거나 감정적인 초안을 정책 의도는 유지하면서 차분하고 존중 있는 답변으로 바꾸는 데 특히 유용합니다.",
        },
        {
          q: "엔터프라이즈 플랜이 있나요?",
          a: "네. 맞춤 온보딩, 보안 검토, 구매 프로세스 지원, 워크플로 가이드를 포함할 수 있습니다.",
        },
      ],
    },
    cta: {
      title: "팀의 다국어 커뮤니케이션을 더 명확하게 만드세요.",
      body: "좌석 수, 워크플로, 온보딩, 조직에 맞는 플랜에 대해 상담해 보세요.",
      button: "business@sayok.chat로 문의",
    },
    footer: {
      tagline: "보내기 전에 메시지를 더 좋게.",
      contact: "문의",
      rights: "All rights reserved.",
    },
  },
  zh: {
    metaTitle: "SayOK Business | 面向全球团队的多语言 AI 沟通工具",
    nav: {
      features: "功能",
      useCases: "使用场景",
      pricing: "价格",
      faq: "FAQ",
      cta: "联系销售",
    },
    hero: {
      eyebrow: "SayOK Business",
      title: "面向全球团队的 AI 沟通质量管理。",
      body: "SayOK Business 帮助销售、客服和运营团队在发送前优化信息，让每一次回复都更清晰、更温和，并符合英语、日语、韩语和中文的本地表达习惯。",
      primary: "联系销售",
      secondary: "了解如何运作",
      statOne: "4 种语言",
      statTwo: "3 种工作模式",
      statThree: "适合团队使用",
    },
    logos: {
      label: "为跨境沟通团队而打造",
      items: ["SaaS", "电商", "旅行", "游戏", "金融科技", "教育"],
    },
    demo: {
      title: "信息优化演示",
      before: "Before",
      after: "After",
      tabs: {
        sales: "销售邮件",
        cs: "客服回复",
        negotiation: "商务谈判",
      },
      content: {
        sales: {
          before:
            "你好，想确认你有没有看我们的提案。方便时请回复。",
          after:
            "Alex 您好，希望您一切顺利。我想跟进一下上周发送给您的提案，确认它是否符合贵团队当前的重点方向。如有任何问题，或需要我们调整方案，欢迎随时告诉我。",
        },
        cs: {
          before:
            "因为不符合政策，所以不能退款。请查看条款。",
          after:
            "感谢您的联系。我理解这件事可能让您感到不便。您的订单已超过标准退款期限，不过我很乐意进一步查看具体情况，并为您确认目前可行的最佳处理方式。",
        },
        negotiation: {
          before:
            "这个价格太低了。要继续合作需要更好的报价。",
          after:
            "感谢您分享报价。为了以可持续的方式继续推进，我们希望能重新讨论价格条件。如果仍有调整空间，我相信双方可以一起找到更合适的合作结构。",
        },
      },
    },
    features: {
      eyebrow: "Features",
      title: "让每一条商务信息都达到可发送的质量。",
      body: "SayOK 在公司对外发送信息前，增加最后一层沟通质量检查。",
      items: [
        {
          icon: "ti-language",
          title: "多语言改写",
          body: "在不改变意图的前提下，用英语、日语、韩语和中文进行自然改写与本地化。",
        },
        {
          icon: "ti-mood-smile",
          title: "语气校准",
          body: "根据场景选择礼貌、简洁、友好、有说服力或带有歉意的表达方式。",
        },
        {
          icon: "ti-shield-check",
          title: "保护品牌语气",
          body: "在发送前减少生硬措辞、歧义和不必要的误解。",
        },
        {
          icon: "ti-bolt",
          title: "快速融入日常流程",
          body: "复制、优化、发送，只需几秒，无需改变团队现有工具。",
        },
        {
          icon: "ti-users",
          title: "团队表达一致",
          body: "为每位成员的重要对外沟通提供可靠的第二次检查。",
        },
        {
          icon: "ti-chart-line",
          title: "面向转化的文案",
          body: "提升销售跟进、续约通知和合作伙伴沟通的清晰度与说服力。",
        },
      ],
    },
    useCases: {
      eyebrow: "Use cases",
      title: "为影响收入与信任的信息而设计。",
      items: [
        {
          title: "销售与合作伙伴",
          body: "将粗略的跟进、提案和谈判记录整理成专业信息，推动下一步对话。",
        },
        {
          title: "客户支持",
          body: "把敏感回复转化为兼具同理心和政策准确性的表达，降低升级风险。",
        },
        {
          title: "全球运营",
          body: "帮助分布式团队用自然的本地语言与客户、供应商和同事沟通。",
        },
      ],
    },
    testimonials: {
      eyebrow: "Testimonials",
      title: "团队使用 SayOK 来降低沟通风险。",
      items: [
        {
          quote:
            "SayOK 让我们的团队即使在快速推进时，也能保持周到的表达。它已经成为销售跟进流程的一部分。",
          name: "Mika Tanaka",
          role: "SaaS 初创公司收入负责人",
        },
        {
          quote:
            "过去显得生硬的客服回复，现在更冷静也更有人情味。它节省了时间，也减少了来回沟通。",
          name: "Daniel Kim",
          role: "Customer Experience Lead",
        },
        {
          quote:
            "在撰写多语言合作伙伴信息时尤其有用。它能保留我们在意的细微语气。",
          name: "Lin Chen",
          role: "Global Operations Manager",
        },
      ],
    },
    pricing: {
      eyebrow: "Pricing",
      title: "选择适合团队的方案。",
      period: "每席 / 月",
      cta: "联系销售",
      plans: [
        {
          name: "Starter",
          price: "$69",
          description: "适合希望改善日常客户信息的小型团队。",
          features: ["最多 5 个席位", "EN/JA/KO/ZH 改写", "演示模式", "邮件支持"],
        },
        {
          name: "Business",
          price: "$199",
          description: "适合希望标准化对外沟通的成长型团队。",
          features: ["最多 25 个席位", "共享团队指南", "优先支持", "使用情况回顾"],
        },
        {
          name: "Enterprise",
          price: "Custom",
          description: "适合有高级工作流和安全需求的组织。",
          features: ["自定义席位", "安全审查", "专属 onboarding", "自定义条款"],
        },
      ],
    },
    faq: {
      eyebrow: "FAQ",
      title: "团队在采用 SayOK 前常问的问题。",
      items: [
        {
          q: "支持哪些语言？",
          a: "SayOK Business 在落地页体验和核心沟通工作流中支持英语、日语、韩语和中文。",
        },
        {
          q: "SayOK 会替代 CRM 或客服系统吗？",
          a: "不会。SayOK 是发送前的沟通优化层，帮助团队在粘贴到现有工具前改进文案。",
        },
        {
          q: "可以用于敏感的客户回复吗？",
          a: "可以。它特别适合把直接或带情绪的草稿，在保留政策意图的同时改写为冷静、尊重的回复。",
        },
        {
          q: "是否提供企业方案？",
          a: "是的。企业方案可包括定制 onboarding、安全审查、采购支持和工作流指导。",
        },
      ],
    },
    cta: {
      title: "让团队的多语言沟通更清晰。",
      body: "联系我们，讨论席位、工作流、onboarding 以及适合贵组织的方案。",
      button: "发送邮件至 business@sayok.chat",
    },
    footer: {
      tagline: "发送前，让信息更好。",
      contact: "联系",
      rights: "All rights reserved.",
    },
  },
} as const;

const detectLanguage = (): Lang => {
  if (typeof window === "undefined") {
    return "en";
  }

  const searchLang = new URLSearchParams(window.location.search).get("lang");
  const normalizedParam = searchLang?.toLowerCase().slice(0, 2);
  if (normalizedParam && langAliases[normalizedParam]) {
    return langAliases[normalizedParam];
  }

  const browserLang = navigator.language.toLowerCase().slice(0, 2);
  return langAliases[browserLang] ?? "en";
};

const buildLangHref = (lang: Lang) => `${baseUrl}?lang=${lang}`;

export default function BusinessPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [activeTab, setActiveTab] = useState<DemoTab>("sales");
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    const detected = detectLanguage();
    setLang(detected);
    document.documentElement.lang = detected;
  }, []);

  const t = copy[lang];
  const demo = t.demo.content[activeTab];
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const typography = typographyByLang[lang];

  const setLanguage = (nextLang: Lang) => {
    setLang(nextLang);
    document.documentElement.lang = nextLang;

    const url = new URL(window.location.href);
    url.searchParams.set("lang", nextLang);
    window.history.replaceState({}, "", url.toString());
  };

  return (
    <main lang={lang} style={{ ...styles.page, fontFamily: typography.body }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=DM+Serif+Display&family=Noto+Sans+JP:wght@400;500;700;800&family=Noto+Sans+KR:wght@400;500;700;800&family=Noto+Sans+SC:wght@400;500;700;800&family=Noto+Serif+JP:wght@600;700&family=Noto+Serif+KR:wght@600;700&family=Noto+Serif+SC:wght@600;700&display=swap"
        rel="stylesheet"
      />
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css"
      />
      <link rel="canonical" href={buildLangHref(lang)} />
      {languages.map((language) => (
        <link
          key={language.code}
          rel="alternate"
          hrefLang={language.code}
          href={buildLangHref(language.code)}
        />
      ))}
      <link rel="alternate" hrefLang="x-default" href={buildLangHref("en")} />

      <nav style={styles.nav} aria-label="Main navigation">
        <div style={{ ...styles.container, ...styles.navInner }}>
          <a href="/" style={styles.brand} aria-label="SayOK home">
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#185FA5",
                color: "#ffffff",
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontSize: 23,
              }}
            >
              S
            </span>
            SayOK Business
          </a>

          <div style={styles.navLinks}>
            <a href="#features" style={{ color: "inherit", textDecoration: "none" }}>
              {t.nav.features}
            </a>
            <a href="#use-cases" style={{ color: "inherit", textDecoration: "none" }}>
              {t.nav.useCases}
            </a>
            <a href="#pricing" style={{ color: "inherit", textDecoration: "none" }}>
              {t.nav.pricing}
            </a>
            <a href="#faq" style={{ color: "inherit", textDecoration: "none" }}>
              {t.nav.faq}
            </a>
            <div style={styles.languageGroup} aria-label="Language switcher">
              {languages.map((language) => {
                const isActive = language.code === lang;
                return (
                  <button
                    key={language.code}
                    type="button"
                    aria-label={language.aria}
                    aria-pressed={isActive}
                    onClick={() => setLanguage(language.code)}
                    style={{
                      border: 0,
                      borderRadius: 999,
                      padding: "8px 11px",
                      background: isActive ? "#185FA5" : "transparent",
                      color: isActive ? "#ffffff" : "#042C53",
                      fontWeight: 800,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    {language.label}
                  </button>
                );
              })}
            </div>
            <a href="mailto:business@sayok.chat" style={{ ...styles.button, minHeight: 42 }}>
              {t.nav.cta}
            </a>
          </div>
        </div>
      </nav>

      <section style={{ padding: "86px 0 72px", overflow: "hidden" }}>
        <div
          style={{
            ...styles.container,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 46,
            alignItems: "center",
          }}
        >
          <div>
            <p style={styles.eyebrow}>{t.hero.eyebrow}</p>
            <h1 style={{ ...styles.heading, ...typography.heading, ...typography.heroHeading }}>
              {t.hero.title}
            </h1>
            <p style={{ ...styles.subheading, maxWidth: 620 }}>{t.hero.body}</p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 30 }}>
              <a href="mailto:business@sayok.chat" style={styles.button}>
                <i className="ti ti-mail" aria-hidden="true" />
                {t.hero.primary}
              </a>
              <a href="#demo" style={styles.secondaryButton}>
                <i className="ti ti-player-play" aria-hidden="true" />
                {t.hero.secondary}
              </a>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
                marginTop: 34,
                maxWidth: 600,
              }}
            >
              {[t.hero.statOne, t.hero.statTwo, t.hero.statThree].map((stat) => (
                <div
                  key={stat}
                  style={{
                    borderLeft: "3px solid #185FA5",
                    background: "#E6F1FB",
                    padding: "14px 12px",
                    color: "#042C53",
                    fontWeight: 800,
                    borderRadius: 8,
                    minHeight: 62,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {stat}
                </div>
              ))}
            </div>
          </div>

          <div id="demo" style={{ ...styles.card, padding: 18 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              <strong style={{ color: "#042C53", fontSize: 18 }}>{t.demo.title}</strong>
              <span
                style={{
                  color: "#185FA5",
                  background: "#E6F1FB",
                  borderRadius: 999,
                  padding: "7px 10px",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                AI rewrite
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {(Object.keys(t.demo.tabs) as DemoTab[]).map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    style={{
                      border: "1px solid rgba(4, 44, 83, 0.12)",
                      borderRadius: 999,
                      padding: "9px 12px",
                      background: isActive ? "#042C53" : "#ffffff",
                      color: isActive ? "#ffffff" : "#042C53",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {t.demo.tabs[tab]}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <DemoPanel label={t.demo.before} text={demo.before} tone="before" />
              <DemoPanel label={t.demo.after} text={demo.after} tone="after" />
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "#E6F1FB", padding: "28px 0" }}>
        <div style={{ ...styles.container, display: "grid", gap: 18 }}>
          <p style={{ margin: 0, color: "#042C53", fontWeight: 800 }}>{t.logos.label}</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: 10,
            }}
          >
            {t.logos.items.map((item) => (
              <div
                key={item}
                style={{
                  minHeight: 54,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid rgba(4, 44, 83, 0.10)",
                  background: "rgba(255,255,255,0.72)",
                  borderRadius: 8,
                  color: "#042C53",
                  fontWeight: 800,
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" style={styles.section}>
        <SectionIntro lang={lang} eyebrow={t.features.eyebrow} title={t.features.title} body={t.features.body} />
        <div
          style={{
            ...styles.container,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 18,
            marginTop: 34,
          }}
        >
          {t.features.items.map((feature) => (
            <article key={feature.title} style={{ ...styles.card, padding: 24 }}>
              <i
                className={`ti ${feature.icon}`}
                aria-hidden="true"
                style={{ color: "#185FA5", fontSize: 34 }}
              />
              <h3 style={{ color: "#042C53", fontSize: 20, margin: "18px 0 10px" }}>
                {feature.title}
              </h3>
              <p style={{ color: "#55544f", lineHeight: 1.7, margin: 0 }}>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="use-cases" style={{ ...styles.section, background: "#f4f9fe" }}>
        <SectionIntro lang={lang} eyebrow={t.useCases.eyebrow} title={t.useCases.title} />
        <div
          style={{
            ...styles.container,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 18,
            marginTop: 34,
          }}
        >
          {t.useCases.items.map((useCase, index) => (
            <article key={useCase.title} style={{ padding: "28px 0", borderTop: "2px solid #185FA5" }}>
              <span style={{ color: "#888780", fontWeight: 800 }}>{String(index + 1).padStart(2, "0")}</span>
              <h3 style={{ color: "#042C53", fontSize: 24, margin: "12px 0 10px" }}>{useCase.title}</h3>
              <p style={{ color: "#55544f", lineHeight: 1.75, margin: 0 }}>{useCase.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <SectionIntro lang={lang} eyebrow={t.testimonials.eyebrow} title={t.testimonials.title} />
        <div
          style={{
            ...styles.container,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 18,
            marginTop: 34,
          }}
        >
          {t.testimonials.items.map((testimonial) => (
            <figure key={testimonial.name} style={{ ...styles.card, padding: 24, margin: 0 }}>
              <blockquote style={{ margin: 0, color: "#1a1a18", lineHeight: 1.75, fontSize: 17 }}>
                “{testimonial.quote}”
              </blockquote>
              <figcaption style={{ marginTop: 20 }}>
                <strong style={{ color: "#042C53" }}>{testimonial.name}</strong>
                <div style={{ color: "#888780", marginTop: 4 }}>{testimonial.role}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section id="pricing" style={{ ...styles.section, background: "#E6F1FB" }}>
        <SectionIntro lang={lang} eyebrow={t.pricing.eyebrow} title={t.pricing.title} />
        <div
          style={{
            ...styles.container,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 18,
            marginTop: 34,
          }}
        >
          {t.pricing.plans.map((plan, index) => (
            <article
              key={plan.name}
              style={{
                ...styles.card,
                padding: 26,
                border: index === 1 ? "2px solid #185FA5" : styles.card.border,
              }}
            >
              <h3 style={{ color: "#042C53", fontSize: 24, margin: 0 }}>{plan.name}</h3>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "18px 0 8px" }}>
                <strong
                  style={{
                    color: "#185FA5",
                    ...typography.price,
                    fontSize: 46,
                    lineHeight: 1,
                  }}
                >
                  {plan.price}
                </strong>
                {plan.price !== "Custom" && plan.price !== "個別見積もり" ? (
                  <span style={{ color: "#888780", fontSize: 13 }}>{t.pricing.period}</span>
                ) : null}
              </div>
              <p style={{ color: "#55544f", lineHeight: 1.7, minHeight: 58 }}>{plan.description}</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 24px", display: "grid", gap: 10 }}>
                {plan.features.map((feature) => (
                  <li key={feature} style={{ display: "flex", gap: 8, color: "#1a1a18" }}>
                    <i className="ti ti-check" aria-hidden="true" style={{ color: "#185FA5", marginTop: 2 }} />
                    {feature}
                  </li>
                ))}
              </ul>
              <a href="mailto:business@sayok.chat" style={{ ...styles.button, width: "100%" }}>
                {t.pricing.cta}
              </a>
            </article>
          ))}
        </div>
      </section>

      <section id="faq" style={styles.section}>
        <SectionIntro lang={lang} eyebrow={t.faq.eyebrow} title={t.faq.title} />
        <div style={{ ...styles.container, maxWidth: 860, marginTop: 34 }}>
          {t.faq.items.map((item, index) => {
            const isOpen = openFaq === index;
            return (
              <div
                key={item.q}
                style={{
                  borderTop: "1px solid rgba(4, 44, 83, 0.13)",
                  borderBottom:
                    index === t.faq.items.length - 1 ? "1px solid rgba(4, 44, 83, 0.13)" : undefined,
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? -1 : index)}
                  aria-expanded={isOpen}
                  style={{
                    width: "100%",
                    border: 0,
                    background: "transparent",
                    color: "#042C53",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 20,
                    padding: "22px 0",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 20,
                    fontWeight: 800,
                  }}
                >
                  {item.q}
                  <i className={`ti ${isOpen ? "ti-minus" : "ti-plus"}`} aria-hidden="true" />
                </button>
                {isOpen ? (
                  <p style={{ color: "#55544f", lineHeight: 1.75, margin: "0 0 22px" }}>{item.a}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ padding: "78px 0", background: "#042C53", color: "#ffffff" }}>
        <div
          style={{
            ...styles.container,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 28,
            flexWrap: "wrap",
          }}
        >
          <div style={{ maxWidth: 680 }}>
            <h2
              style={{
                ...typography.heading,
                fontSize: "clamp(32px, 4vw, 54px)",
                margin: "0 0 14px",
              }}
            >
              {t.cta.title}
            </h2>
            <p style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.75, margin: 0 }}>{t.cta.body}</p>
          </div>
          <a
            href="mailto:business@sayok.chat"
            style={{ ...styles.button, background: "#ffffff", color: "#042C53", borderColor: "#ffffff" }}
          >
            <i className="ti ti-mail" aria-hidden="true" />
            {t.cta.button}
          </a>
        </div>
      </section>

      <footer style={{ padding: "36px 0", background: "#ffffff" }}>
        <div
          style={{
            ...styles.container,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            color: "#55544f",
          }}
        >
          <div>
            <strong style={{ color: "#042C53" }}>SayOK Business</strong>
            <div style={{ marginTop: 6 }}>{t.footer.tagline}</div>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <a href="mailto:business@sayok.chat" style={{ color: "#185FA5", fontWeight: 800 }}>
              {t.footer.contact}: business@sayok.chat
            </a>
            <span>
              © {currentYear} SayOK. {t.footer.rights}
            </span>
          </div>
        </div>
      </footer>
    </main>
  );
}

function SectionIntro({
  lang,
  eyebrow,
  title,
  body,
}: {
  lang: Lang;
  eyebrow: string;
  title: string;
  body?: string;
}) {
  const typography = typographyByLang[lang];

  return (
    <div style={{ ...styles.container, maxWidth: 800 }}>
      <p style={styles.eyebrow}>{eyebrow}</p>
      <h2
        style={{
          ...typography.heading,
          color: "#042C53",
          fontSize: "clamp(32px, 4vw, 54px)",
          letterSpacing: 0,
          margin: "0 0 16px",
        }}
      >
        {title}
      </h2>
      {body ? <p style={styles.subheading}>{body}</p> : null}
    </div>
  );
}

function DemoPanel({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone: "before" | "after";
}) {
  const isAfter = tone === "after";

  return (
    <div
      style={{
        border: `1px solid ${isAfter ? "rgba(24, 95, 165, 0.24)" : "rgba(4, 44, 83, 0.10)"}`,
        background: isAfter ? "#E6F1FB" : "#fafafa",
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: isAfter ? "#185FA5" : "#888780",
          fontWeight: 800,
          fontSize: 13,
          marginBottom: 8,
        }}
      >
        <i className={`ti ${isAfter ? "ti-sparkles" : "ti-pencil"}`} aria-hidden="true" />
        {label}
      </div>
      <p style={{ color: isAfter ? "#042C53" : "#55544f", lineHeight: 1.7, margin: 0 }}>{text}</p>
    </div>
  );
}
