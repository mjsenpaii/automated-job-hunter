import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import { ResumeProfile } from './types';
import * as fs from 'fs/promises';

export interface CoverLetterParams {
  candidateName: string;
  jobTitle: string;
  company: string;
  matchedSkills: string[];
  relevantExperience: string[];
  resumeProfile: ResumeProfile;
}

export type CoverLetterDocument = Document;

export function generateCoverLetter(params: CoverLetterParams): CoverLetterDocument {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  
  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: params.candidateName, bold: true })],
      alignment: AlignmentType.LEFT,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: date,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: `Hiring Manager`,
      spacing: { after: 100 }
    }),
    new Paragraph({
      text: params.company,
      spacing: { after: 400 }
    }),
    new Paragraph({
      text: `Dear Hiring Manager,`,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: `I am writing to express my strong interest in the ${params.jobTitle} position at ${params.company}. As a highly motivated professional and recent graduate with a passion for continuous learning, I am confident in my ability to contribute effectively to your team.`,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: `My technical skill set aligns well with your requirements, particularly my proficiency in ${params.matchedSkills.join(', ')}. During my academic journey and recent experiences, including ${params.relevantExperience.join(' and ')}, I have developed a solid foundation in these areas and a track record of applying them to solve practical problems.`,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: `What draws me to ${params.company} is the opportunity to work in a dynamic environment where I can leverage my background in ${params.resumeProfile.name} to deliver high-quality results. I am particularly excited about the chance to bring my strong problem-solving abilities and dedication to excellence to your organization.`,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: `Thank you for considering my application. I have attached my resume for your review, and I would welcome the opportunity to discuss how my skills and experiences make me a strong candidate for this role. I look forward to the possibility of contributing to the success of ${params.company}.`,
      spacing: { after: 400 }
    }),
    new Paragraph({
      text: `Sincerely,`,
      spacing: { after: 400 }
    }),
    new Paragraph({
      text: params.candidateName,
      spacing: { after: 200 }
    })
  ];

  return new Document({
    sections: [{
      properties: {},
      children: children
    }]
  });
}

export async function saveCoverLetterDocx(coverLetter: CoverLetterDocument, outputPath: string): Promise<string> {
  const buffer = await Packer.toBuffer(coverLetter);
  await fs.writeFile(outputPath, buffer);
  return outputPath;
}
