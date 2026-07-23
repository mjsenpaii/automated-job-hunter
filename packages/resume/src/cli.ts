import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { mapProfileToResume } from './fact-mapper.js';
import { saveDocx } from './docx-generator.js';
import { runQualityGates } from './quality-gates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);
  const profileArgIndex = args.indexOf('--profile');
  if (profileArgIndex === -1 || profileArgIndex + 1 >= args.length) {
    console.error('Usage: npx tsx packages/resume/src/cli.ts --profile <profile-name>');
    process.exit(1);
  }
  
  const profileName = args[profileArgIndex + 1];
  
  // Read candidate data
  const candidateDir = path.resolve(__dirname, '../../../../candidate');
  
  let contactData: any = {};
  let skillsData: any = {};
  let experienceData: any = {};
  let educationData: any = {};
  let projectsData: any = {};
  let certificationsData: any = {};

  try {
    const contactFile = await fs.readFile(path.join(candidateDir, 'contact.json'), 'utf-8');
    contactData = JSON.parse(contactFile);
  } catch (e) {
    console.warn('Could not read contact.json');
  }

  try {
    const skillsFile = await fs.readFile(path.join(candidateDir, 'skills.json'), 'utf-8');
    skillsData = JSON.parse(skillsFile);
  } catch (e) {
    console.warn('Could not read skills.json');
  }

  try {
    const expFile = await fs.readFile(path.join(candidateDir, 'experience.json'), 'utf-8');
    experienceData = JSON.parse(expFile);
  } catch (e) {
    console.warn('Could not read experience.json');
  }

  try {
    const eduFile = await fs.readFile(path.join(candidateDir, 'education.json'), 'utf-8');
    educationData = JSON.parse(eduFile);
  } catch (e) {
    console.warn('Could not read education.json');
  }

  try {
    const projFile = await fs.readFile(path.join(candidateDir, 'projects.json'), 'utf-8');
    projectsData = JSON.parse(projFile);
  } catch (e) {
    console.warn('Could not read projects.json');
  }

  try {
    const certFile = await fs.readFile(path.join(candidateDir, 'certifications.json'), 'utf-8');
    certificationsData = JSON.parse(certFile);
  } catch (e) {
    console.warn('Could not read certifications.json');
  }

  const candidateData = {
    ...contactData,
    skills: skillsData.skills || [],
    experiences: experienceData.experiences || [],
    education: educationData.education || [],
    projects: projectsData.projects || [],
    certifications: certificationsData.certifications || []
  };

  const resume = mapProfileToResume(candidateData, profileName);
  
  const qualityResults = runQualityGates(resume);
  console.log('Quality Gates Results:', qualityResults);

  const outputDir = path.resolve(__dirname, '../../../resumes/generated');
  await fs.mkdir(outputDir, { recursive: true });
  
  const outputPath = path.join(outputDir, `resume-${profileName}.docx`);
  await saveDocx(resume, outputPath);
  
  console.log(`Successfully generated resume for profile '${profileName}' at ${outputPath}`);
}

main().catch(console.error);
