import { entryLevel, type ExperienceSignals } from './experience';
import { outsideUk } from './location';
import { isAgency, normaliseName } from './normalise';
import { roleFlags } from './roleLevel';
import { parseSalary } from './salary';
import { activeFloor, type CompanyMatch, type Overrides, type Salary, type Settings, type TextSignals, type Verdict } from './types';
import { decide } from './verdict';

/** What an adapter reads from a job card or job page. */
export interface JobFacts {
  jobId: string;
  title: string;
  company: string;
  /** Salary line shown by the site, if any. */
  salaryText?: string;
  /** Employment-type line, e.g. "Full-time · Contract". */
  meta?: string;
  /** Where the job is, when the site says. */
  location?: string;
  /**
   * Another name for the employer, e.g. "barclays" from a Workday address,
   * tried when the posted company isn't on the register.
   */
  companyAlt?: string;
}

/** What was learnt from reading the full description; cached per job. */
export interface DescriptionSignals {
  text: TextSignals;
  salary?: Salary;
  roleFlags: string[];
  experience?: ExperienceSignals;
}

/** Turns one job plus everything known about it into a verdict. */
export function judge(
  job: JobFacts,
  registerMatch: CompanyMatch,
  described: DescriptionSignals | undefined,
  settings: Settings,
  overrides: Overrides,
): Verdict {
  const companyOverride = overrides.companies[normaliseName(job.company)];
  let match = registerMatch;
  if (companyOverride?.kind === 'sponsors') match = { licensed: true, kind: 'override', registerNames: [], score: 1 };
  if (companyOverride?.kind === 'link') match = { licensed: true, kind: 'override', registerNames: [companyOverride.registerName], score: 1 };

  const flags = new Set([...roleFlags({ title: job.title, meta: job.meta }), ...(described?.roleFlags ?? [])]);

  const verdict = decide({
    company: job.company,
    match,
    isAgency: isAgency(job.company),
    text: described?.text,
    salary: parseSalary(job.salaryText) ?? described?.salary,
    roleFlags: [...flags],
    floor: activeFloor(settings),
    companyOverride,
    jobOverride: overrides.jobs[job.jobId],
  });
  const abroad = outsideUk(job.location);
  return {
    ...verdict,
    details: abroad ? [...verdict.details, `Based in ${abroad}, outside the UK; the UK sponsor licence is shown for reference.`] : verdict.details,
    entryLevel: entryLevel(job.title, described?.experience),
    outsideUk: abroad,
  };
}
