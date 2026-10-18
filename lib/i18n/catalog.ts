export const READY_LOCALES = ["en", "hi", "ta", "te", "mr", "kn"] as const;
export type Locale = (typeof READY_LOCALES)[number];

const EN = {
  analyticsTitle: "Recruiter analytics",
  analyticsIntro: "Time to hire, where people leave, and which sources hire.",
  filterLabel: "Ask about this report",
  filterPlaceholder: "Time to hire from Naukri",
  trainingTitle: "Interviewer training",
  trainingIntro: "Shadow two interviews and reverse-shadow two before leading.",
  outreachTitle: "Outreach",
  outreachIntro: "Drafts stay unsent until a recruiter approves them.",
} as const;

const HI: Record<keyof typeof EN, string> = {
  analyticsTitle: "भर्ती विश्लेषण",
  analyticsIntro: "भर्ती में लगा समय, कहाँ उम्मीदवार रुकते हैं, और कौन सा स्रोत बेहतर लोगों को लाता है।",
  filterLabel: "इस रिपोर्ट के बारे में पूछें",
  filterPlaceholder: "Naukri से भर्ती में लगा समय",
  trainingTitle: "साक्षात्कारकर्ता प्रशिक्षण",
  trainingIntro: "लीड बनने से पहले दो शैडो और दो रिवर्स-शैडो पूरे करें।",
  outreachTitle: "आउटरीच",
  outreachIntro: "ईमेल तब तक नहीं जाता जब तक भर्तीकर्ता मंजूरी न दे।",
};

export type MessageKey = keyof typeof EN;

export function translate(locale: string, key: MessageKey) {
  if (locale === "hi") return { text: HI[key], translated: true, locale: "hi" as const };
  if (locale === "en") return { text: EN[key], translated: true, locale: "en" as const };
  if (READY_LOCALES.includes(locale as Locale)) {
    return { text: EN[key], translated: false, locale: locale as Locale };
  }
  return { text: EN[key], translated: true, locale: "en" as const };
}
