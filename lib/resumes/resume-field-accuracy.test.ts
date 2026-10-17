import { describe, expect, it } from "vitest";

import { heuristicResumeFields, tenureMonths } from "@/lib/resumes/resume-field-extractor";

const TITLES = ["Software Engineer", "Data Analyst", "Product Manager"];
const COMPANIES = ["Example Co", "Northwind Labs", "Contoso"];
const STARTS = ["Jan 2020", "Mar 2019", "Jun 2021"];
const ENDS = ["Mar 2023", "Dec 2022", "Jan 2024"];
const SKILLS = ["ReactJS", "Node.js", "Python"];
const CANONICAL = ["React", "Node.js", "Python"];
const DEGREES = ["B.Tech", "B.Sc", "MBA"];
const SCHOOLS = ["Example University", "State College", "City Institute"];
const PROJECTS = ["Hiring Portal", "Ledger App", "Field Survey"];
const CERTS = ["AWS Cloud Practitioner", "Scrum Guide", "SQL Basics"];

function labelledSet(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const title = TITLES[index % TITLES.length];
    const company = COMPANIES[index % COMPANIES.length];
    const start = STARTS[index % STARTS.length];
    const end = ENDS[index % ENDS.length];
    const skill = SKILLS[index % SKILLS.length];
    const credential = DEGREES[index % DEGREES.length];
    const school = SCHOOLS[index % SCHOOLS.length];
    const project = PROJECTS[index % PROJECTS.length];
    const certification = CERTS[index % CERTS.length];
    return {
      text: [
        `Candidate ${index}`,
        `${title} at ${company} (${start} - ${end})`,
        `Skills: ${skill}`,
        `Education: ${credential} at ${school}`,
        `Project: ${project}`,
        `Certification: ${certification}`,
      ].join("\n"),
      title,
      company,
      start,
      end,
      skill: CANONICAL[index % CANONICAL.length],
      credential,
      school,
      project,
      certification,
    };
  });
}

describe("labelled resume field accuracy", () => {
  it("scores title, company, dates, skill, education, project, and certification on 50 resumes", () => {
    const samples = labelledSet(50);
    const hits = {
      title: 0,
      company: 0,
      dates: 0,
      skill: 0,
      education: 0,
      project: 0,
      certification: 0,
      tenure: 0,
    };
    for (const sample of samples) {
      const fields = heuristicResumeFields(sample.text);
      const role = fields?.experience[0];
      if (role?.title.value === sample.title) hits.title += 1;
      if (role?.organization?.value === sample.company) hits.company += 1;
      if (role?.startDate?.value === sample.start && role.endDate?.value === sample.end) hits.dates += 1;
      if (role?.startDate && role.endDate && tenureMonths(role.startDate.value, role.endDate.value) !== null) {
        hits.tenure += 1;
      }
      if (fields?.skills.some((skill) => skill.value === sample.skill)) hits.skill += 1;
      if (
        fields?.education[0]?.credential.value === sample.credential &&
        fields.education[0].institution?.value === sample.school
      ) {
        hits.education += 1;
      }
      if (fields?.projects[0]?.name.value === sample.project) hits.project += 1;
      if (fields?.certifications[0]?.value === sample.certification) hits.certification += 1;
    }
    for (const value of Object.values(hits)) {
      expect(value / samples.length).toBe(1);
    }
  });
});
