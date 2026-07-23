import { describe, it, expect } from 'vitest';
import { ingestJob } from '../src/pipeline';
import type { RawJobInput } from '../src/types';
import { VERIFIED_SKILLS } from '../../../tests/fixtures/jobs';
import { NormalizedJob } from '@job-app/core';

describe('Realistic Job Validation Tests', () => {
  const existingJobs: NormalizedJob[] = [];

  it('Scenario 1: PH Remote Junior Software Developer', async () => {
    const raw: RawJobInput = {
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
    };

    const result = await ingestJob(raw, existingJobs, VERIFIED_SKILLS);
    
    expect(result.status).toBe('INGESTED');
    expect(result.normalized_job.category).toBe('PH');
    expect(result.normalized_job.work_setup).toBe('REMOTE');
    expect(result.normalized_job.eligibility_status).toBe('ELIGIBLE');
    expect(result.score).toBeGreaterThanOrEqual(55);

    // Save to existingJobs for duplication test
    existingJobs.push(result.normalized_job);
  });

  it('Scenario 1b: Duplicate check for Scenario 1', async () => {
    const raw: RawJobInput = {
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
    };

    const result = await ingestJob(raw, existingJobs, VERIFIED_SKILLS);
    
    expect(result.status).toBe('DUPLICATE');
  });

  it('Scenario 2: PH Hybrid Web Developer in Metro Manila', async () => {
    const raw: RawJobInput = {
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
    };

    const result = await ingestJob(raw, existingJobs, VERIFIED_SKILLS);
    
    expect(result.status).toBe('INGESTED');
    expect(result.normalized_job.category).toBe('PH');
    expect(result.normalized_job.work_setup).toBe('HYBRID');
    expect(result.normalized_job.eligibility_status).toBe('ELIGIBLE');
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it('Scenario 3: PH Onsite Technical Support', async () => {
    const raw: RawJobInput = {
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
    };

    const result = await ingestJob(raw, existingJobs, VERIFIED_SKILLS);
    
    expect(result.status).toBe('INGESTED');
    expect(result.normalized_job.category).toBe('PH');
    expect(result.normalized_job.work_setup).toBe('ONSITE');
    expect(result.normalized_job.eligibility_status).toBe('ELIGIBLE');
    expect(result.score).toBeGreaterThanOrEqual(45);
  });

  it('Scenario 4: International Remote — Worldwide', async () => {
    const raw: RawJobInput = {
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
    };

    const result = await ingestJob(raw, existingJobs, VERIFIED_SKILLS);
    
    expect(result.status).toBe('INGESTED');
    expect(result.normalized_job.category).toBe('INTERNATIONAL');
    expect(result.normalized_job.work_setup).toBe('REMOTE');
    expect(result.normalized_job.eligibility_status).toBe('ELIGIBLE');
    expect(result.score).toBeGreaterThanOrEqual(55);
  });

  it('Scenario 5: International Remote — APAC', async () => {
    const raw: RawJobInput = {
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
    };

    const result = await ingestJob(raw, existingJobs, VERIFIED_SKILLS);
    
    expect(result.status).toBe('INGESTED');
    expect(result.normalized_job.category).toBe('INTERNATIONAL');
    expect(result.normalized_job.work_setup).toBe('REMOTE');
    expect(result.normalized_job.eligibility_status).toBe('ELIGIBLE');
    expect(result.score).toBeGreaterThanOrEqual(60);
  });

  it('Scenario 6: International Remote — US Only', async () => {
    const raw: RawJobInput = {
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
    };

    const result = await ingestJob(raw, existingJobs, VERIFIED_SKILLS);
    
    expect(result.status).toBe('HARD_REJECTED');
    expect(result.normalized_job.category).toBe('INTERNATIONAL');
    expect(result.normalized_job.work_setup).toBe('REMOTE');
    expect(result.rejection_reasons).toContain('COUNTRY_INELIGIBLE');
  });

  it('Scenario 7: Senior Role — 5+ years', async () => {
    const raw: RawJobInput = {
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
    };

    const result = await ingestJob(raw, existingJobs, VERIFIED_SKILLS);
    
    expect(result.status).toBe('HARD_REJECTED');
    expect(result.rejection_reasons).toContain('SENIORITY_MISMATCH');
  });

  it('Scenario 8: Scam/MLM Listing', async () => {
    const raw: RawJobInput = {
      source_name: 'validation-test',
      title: 'Work From Home — Earn $5,000/Week!',
      company: 'Global Income Solutions',
      description: 'No experience needed! Join our team and earn unlimited income from the comfort of your home. This is a multi-level marketing opportunity. Purchase your starter kit for just $299 and start earning commissions immediately. Cryptocurrency investment training included. Commission only — the more you recruit, the more you earn! Buy equipment to get started.',
      work_setup_hint: 'remote',
      employment_type: 'Commission',
      salary_text: '$5,000/week guaranteed',
      application_url: 'https://global-income.example.com/join',
    };

    const result = await ingestJob(raw, existingJobs, VERIFIED_SKILLS);
    
    expect(result.status).toBe('HARD_REJECTED');
    expect(result.rejection_reasons).toContain('SCAM_PATTERN');
  });
});
