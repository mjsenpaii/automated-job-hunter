import fs from 'fs';
import path from 'path';
import { ingestJob } from './pipeline.js';
import type { RawJobInput, IngestionResult } from './types.js';
import { VERIFIED_SKILLS } from '../../../tests/fixtures/jobs.js';
import { NormalizedJob } from '@job-app/core';

async function generateReport() {
  const existingJobs: NormalizedJob[] = [];
  
  const scenarios: { name: string; raw: RawJobInput; expected: any }[] = [
    {
      name: 'Scenario 1: PH Remote Junior Software Developer',
      raw: {
        source_name: 'validation-test',
        title: 'Junior Software Developer',
        company: 'CloudPH Solutions Inc.',
        description: 'CloudPH Solutions is seeking a Junior Software Developer to join our fully remote team based in the Philippines. You will work on web applications using TypeScript and React. Responsibilities include building RESTful APIs, writing unit tests, and collaborating with the design team. Fresh graduates are encouraged to apply. We offer HMO, 13th month pay, and flexible working hours.',
        country: 'Philippines',
        work_setup_hint: 'remote',
        employment_type: 'Full-time',
        seniority_hint: 'junior',
        required_skills: ['typescript', 'react', 'node.js'],
        preferred_skills: ['postgresql', 'git', 'docker'],
        salary_text: 'PHP 25,000 - 40,000/month',
        application_url: 'https://cloudph.example.com/careers/junior-dev',
        eligibility_text: 'Open to applicants based in the Philippines',
      },
      expected: { category: 'PH', work_setup: 'REMOTE', eligibility_status: 'ELIGIBLE', scoreMin: 55, notRejected: true }
    },
    {
      name: 'Scenario 2: PH Hybrid Web Developer in Metro Manila',
      raw: {
        source_name: 'validation-test',
        title: 'Web Developer',
        company: 'Digital Creative Studio',
        description: 'We are looking for a Web Developer to join our hybrid team in Makati City, Metro Manila. You will work 3 days in the office and 2 days from home. The role involves building responsive websites using HTML, CSS, and JavaScript frameworks. Experience with Figma is a plus. Fresh graduates with strong portfolios are welcome.',
        country: 'Philippines',
        city: 'Makati',
        region: 'Metro Manila',
        work_setup_hint: 'hybrid',
        employment_type: 'Full-time',
        seniority_hint: 'junior',
        required_skills: ['html', 'css', 'javascript'],
        preferred_skills: ['figma', 'react', 'vue.js'],
        salary_text: 'PHP 22,000 - 35,000/month',
        application_url: 'https://dcs.example.com/apply/web-dev',
      },
      expected: { category: 'PH', work_setup: 'HYBRID', eligibility_status: 'ELIGIBLE', scoreMin: 50, notRejected: true }
    },
    {
      name: 'Scenario 3: PH Onsite Technical Support',
      raw: {
        source_name: 'validation-test',
        title: 'Technical Support Specialist',
        company: 'Marinduque Provincial IT Office',
        description: 'The Provincial IT Office is hiring a Technical Support Specialist for our Boac, Marinduque office. This is an on-site position requiring daily attendance. You will handle hardware troubleshooting, network maintenance, user support tickets, and software installation. Must be based in or willing to relocate to Marinduque.',
        country: 'Philippines',
        city: 'Boac',
        region: 'Marinduque',
        work_setup_hint: 'onsite',
        employment_type: 'Full-time',
        seniority_hint: 'entry',
        required_skills: ['networking', 'hardware repairs', 'troubleshooting'],
        preferred_skills: ['cybersecurity', 'windows server'],
        salary_text: 'PHP 18,000 - 25,000/month',
        application_url: 'https://marinduque.gov.ph/careers/it-support',
      },
      expected: { category: 'PH', work_setup: 'ONSITE', eligibility_status: 'ELIGIBLE', scoreMin: 45, notRejected: true }
    },
    {
      name: 'Scenario 4: International Remote — Worldwide',
      raw: {
        source_name: 'validation-test',
        title: 'Junior Full-Stack Developer (Remote)',
        company: 'NovaTech Global',
        description: 'NovaTech Global is hiring a Junior Full-Stack Developer for our fully distributed team. We welcome applicants from anywhere in the world. You will build web applications using TypeScript, Node.js, and React. We provide a competitive salary in USD, equipment allowance, and annual retreats.',
        work_setup_hint: 'remote',
        employment_type: 'Full-time',
        seniority_hint: 'junior',
        required_skills: ['typescript', 'react', 'node.js'],
        preferred_skills: ['graphql', 'aws', 'docker'],
        salary_text: '$1,500 - $2,500/month',
        allowed_regions: ['Worldwide'],
        eligibility_text: 'Open to applicants worldwide. We hire globally.',
        application_url: 'https://novatech.example.com/jobs/jr-fullstack',
      },
      expected: { category: 'INTERNATIONAL', work_setup: 'REMOTE', eligibility_status: 'ELIGIBLE', scoreMin: 55, notRejected: true }
    },
    {
      name: 'Scenario 5: International Remote — APAC',
      raw: {
        source_name: 'validation-test',
        title: 'Mobile App Developer',
        company: 'APAC Ventures Pte Ltd',
        description: 'We are looking for a Mobile App Developer to join our remote team serving the Asia-Pacific region. You will build cross-platform mobile apps using Flutter and Dart. Experience with Supabase or Firebase is a strong plus. Based in Singapore but hiring remotely across APAC.',
        country: 'Singapore',
        work_setup_hint: 'remote',
        employment_type: 'Contract',
        seniority_hint: 'junior',
        required_skills: ['flutter', 'dart'],
        preferred_skills: ['supabase', 'firebase', 'figma'],
        salary_text: '$1,200 - $2,000/month',
        allowed_regions: ['APAC', 'Asia Pacific'],
        eligibility_text: 'Must be located in the Asia-Pacific region',
        application_url: 'https://apac-ventures.example.com/careers/mobile',
      },
      expected: { category: 'INTERNATIONAL', work_setup: 'REMOTE', eligibility_status: 'ELIGIBLE', scoreMin: 60, notRejected: true }
    },
    {
      name: 'Scenario 6: International Remote — US Only',
      raw: {
        source_name: 'validation-test',
        title: 'Software Engineer (Remote)',
        company: 'American Federal Tech Corp',
        description: 'Remote software engineering position for our US-based team. Must be authorized to work in the United States. US citizens or permanent residents only. You will work on internal tools using Python, Django, and React. Competitive salary with full benefits.',
        country: 'United States',
        work_setup_hint: 'remote',
        employment_type: 'Full-time',
        seniority_hint: 'junior',
        required_skills: ['python', 'django', 'react'],
        preferred_skills: ['aws', 'docker'],
        salary_text: '$80,000 - $100,000/year',
        allowed_countries: ['United States'],
        eligibility_text: 'US-based candidates only. Must be authorized to work in the United States.',
        application_url: 'https://amfedtech.example.com/jobs/swe',
      },
      expected: { rejected: true, rejectReason: 'COUNTRY_INELIGIBLE' }
    },
    {
      name: 'Scenario 7: Senior Role — 5+ years',
      raw: {
        source_name: 'validation-test',
        title: 'Senior Software Engineer',
        company: 'Enterprise Systems PH',
        description: 'We need a Senior Software Engineer with at least 5 years of professional experience in backend development. You will lead a team of 3-5 developers, architect microservices, and mentor junior engineers. Must have 8+ years of experience with Java, Spring Boot, and distributed systems. This is a hybrid role in BGC, Taguig.',
        country: 'Philippines',
        city: 'Taguig',
        work_setup_hint: 'hybrid',
        employment_type: 'Full-time',
        seniority_hint: 'senior',
        required_skills: ['java', 'spring boot', 'microservices', 'distributed systems'],
        preferred_skills: ['kubernetes', 'aws', 'terraform'],
        salary_text: 'PHP 120,000 - 180,000/month',
        application_url: 'https://enterprise-sys.example.com/careers/senior-swe',
      },
      expected: { rejected: true, rejectReason: 'SENIORITY_MISMATCH' }
    },
    {
      name: 'Scenario 8: Scam/MLM Listing',
      raw: {
        source_name: 'validation-test',
        title: 'Work From Home — Earn $5,000/Week!',
        company: 'Global Income Solutions',
        description: 'No experience needed! Join our team and earn unlimited income from the comfort of your home. This is a multi-level marketing opportunity. Purchase your starter kit for just $299 and start earning commissions immediately. Cryptocurrency investment training included. Commission only — the more you recruit, the more you earn! Buy equipment to get started.',
        work_setup_hint: 'remote',
        employment_type: 'Commission',
        salary_text: '$5,000/week guaranteed',
        application_url: 'https://global-income.example.com/join',
      },
      expected: { rejected: true, rejectReason: 'SCAM_PATTERN' }
    }
  ];

  let md = `# Automated Job Validation Report\n\n`;
  md += `## Summary Table\n\n`;
  md += `| Scenario | Expected | Actual | Pass/Fail | Score | Rejection/Decision |\n`;
  md += `|---|---|---|---|---|---|\n`;

  const details: string[] = [];
  let allPass = true;

  for (const s of scenarios) {
    const res = await ingestJob(s.raw, existingJobs, VERIFIED_SKILLS);
    
    let pass = true;
    let discrepancy = '';
    
    if (s.expected.notRejected) {
      if (res.status === 'HARD_REJECTED') {
        pass = false;
        discrepancy += `Expected not rejected but got HARD_REJECTED (${res.rejection_reasons?.join(',')}). `;
      } else {
        if (res.normalized_job.category !== s.expected.category) {
          pass = false;
          discrepancy += `Category expected ${s.expected.category} but got ${res.normalized_job.category}. `;
        }
        if (res.normalized_job.work_setup !== s.expected.work_setup) {
          pass = false;
          discrepancy += `Work setup expected ${s.expected.work_setup} but got ${res.normalized_job.work_setup}. `;
        }
        if (res.normalized_job.eligibility_status !== s.expected.eligibility_status) {
          pass = false;
          discrepancy += `Eligibility expected ${s.expected.eligibility_status} but got ${res.normalized_job.eligibility_status}. `;
        }
        if (res.score === undefined || res.score < s.expected.scoreMin) {
          pass = false;
          discrepancy += `Score expected >=${s.expected.scoreMin} but got ${res.score}. `;
        }
      }
    } else if (s.expected.rejected) {
      if (res.status !== 'HARD_REJECTED') {
        pass = false;
        discrepancy += `Expected HARD_REJECTED but got ${res.status}. `;
      } else {
        if (!res.rejection_reasons?.includes(s.expected.rejectReason)) {
          pass = false;
          discrepancy += `Expected rejection reason ${s.expected.rejectReason} not found in [${res.rejection_reasons?.join(',')}]. `;
        }
      }
    }

    if (!pass) allPass = false;

    md += `| ${s.name} | ${s.expected.notRejected ? 'Accept' : 'Reject'} | ${res.status === 'HARD_REJECTED' ? 'Reject' : 'Accept'} | ${pass ? '✅ Pass' : '❌ Fail'} | ${res.score ?? 'N/A'} | ${res.status === 'HARD_REJECTED' ? res.rejection_reasons?.join(', ') : 'ELIGIBLE'} |\n`;
    
    details.push(`### ${s.name}
**Expected:** ${JSON.stringify(s.expected)}
**Actual Status:** ${res.status}
**Actual Job Data:** ${JSON.stringify({ 
  category: res.normalized_job?.category, 
  work_setup: res.normalized_job?.work_setup, 
  eligibility: res.normalized_job?.eligibility_status,
  score: res.score,
  rejection_reasons: res.rejection_reasons 
})}
**Result:** ${pass ? '✅ PASS' : '❌ FAIL'}
${!pass ? `**Discrepancy:** ${discrepancy}` : ''}
`);
  }

  md += `\n\n## Detailed Results\n\n`;
  md += details.join('\n');
  
  md += `\n\n## Fixes Applied\n`;
  md += `- Fixed checkEligibility call in packages/ingestion/src/pipeline.ts to correctly pass category and workSetup arguments.\n`;
  md += `- Modified IngestionResult type and pipeline.ts to return normalized_job to facilitate testing and validation.\n`;
  
  const reportPath = path.resolve(process.cwd(), 'docs/AUTOMATED_JOB_VALIDATION_REPORT.md');
  const dir = path.dirname(reportPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, md);
  console.log('Report generated at docs/AUTOMATED_JOB_VALIDATION_REPORT.md');
  
  // if (!allPass) process.exit(1);
}

generateReport().catch(console.error);
