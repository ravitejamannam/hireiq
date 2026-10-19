/** Common Indian employer names and the abbreviations resumes use. */
const EMPLOYER_GROUPS = [
  ["TCS", "Tata Consultancy Services"],
  ["Infosys", "Infosys Limited"],
  ["Wipro", "Wipro Limited"],
  ["HCL", "HCL Technologies"],
  ["Tech Mahindra", "Mahindra Satyam"],
  ["Cognizant", "CTS"],
  ["Capgemini"],
  ["Accenture"],
  ["IBM", "International Business Machines"],
  ["Oracle"],
  ["SAP"],
  ["Microsoft"],
  ["Amazon", "Amazon Web Services", "AWS"],
  ["Google"],
  ["Deloitte"],
  ["PwC", "PricewaterhouseCoopers"],
  ["EY", "Ernst & Young", "Ernst and Young"],
  ["KPMG"],
  ["LTIMindtree", "LTI", "Larsen & Toubro Infotech", "Mindtree"],
  ["Mphasis"],
  ["Persistent", "Persistent Systems"],
  ["Hexaware"],
  ["Birlasoft"],
  ["Zensar"],
  ["Cyient"],
  ["Sonata Software"],
  ["NIIT", "NIIT Technologies"],
  ["Genpact"],
  ["EXL", "EXL Service"],
  ["WNS"],
  ["Concentrix"],
  ["HDFC", "HDFC Bank"],
  ["ICICI", "ICICI Bank"],
  ["Axis Bank"],
  ["SBI", "State Bank of India"],
  ["Reliance", "Reliance Industries", "Jio"],
  ["Tata Motors"],
  ["Tata Steel"],
  ["Mahindra", "Mahindra & Mahindra"],
  ["Larsen & Toubro", "L&T"],
  ["BHEL", "Bharat Heavy Electricals"],
  ["ONGC", "Oil and Natural Gas Corporation"],
  ["NTPC"],
  ["ISRO", "Indian Space Research Organisation"],
  ["DRDO", "Defence Research and Development Organisation"],
  ["Flipkart"],
  ["Paytm"],
  ["PhonePe"],
  ["Razorpay"],
  ["Zoho"],
] as const;

function fold(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function canonicalEmployer(raw: string): string | null {
  const key = fold(raw);
  if (key.length < 2) return null;
  let best: { name: string; length: number } | null = null;
  for (const group of EMPLOYER_GROUPS) {
    for (const name of group) {
      const alias = fold(name);
      if (alias.length < 3) continue;
      if (key === alias) {
        if (!best || alias.length > best.length) best = { name: group[0], length: alias.length };
        continue;
      }
      // Short aliases must match the whole name. "LTI" must not fire inside an unrelated word.
      if (alias.length < 5) continue;
      if (!key.includes(alias) && !alias.includes(key)) continue;
      if (!best || alias.length > best.length) best = { name: group[0], length: alias.length };
    }
  }
  return best?.name ?? null;
}

export function employersMatch(expected: string, actual: string) {
  const left = canonicalEmployer(expected);
  const right = canonicalEmployer(actual);
  return Boolean(left && right && left === right);
}
