import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { ResumeDocument } from './types';
import * as fs from 'fs/promises';

export async function generateDocx(resume: ResumeDocument): Promise<Buffer> {
  const children: Paragraph[] = [];

  for (const section of resume.sections) {
    if (section.type === 'header') {
      const headerItem = section.items[0];
      children.push(
        new Paragraph({
          text: headerItem.name.toUpperCase(),
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 }
        })
      );
      
      const linksText = (headerItem.links || []).map((l: any) => `${l.label}: ${l.url}`).join(' | ');
      const contactText = `${headerItem.location} | ${headerItem.email} | ${headerItem.phone}`;
      
      children.push(
        new Paragraph({
          children: [new TextRun(contactText)],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 }
        })
      );

      if (linksText) {
        children.push(
          new Paragraph({
            children: [new TextRun(linksText)],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
          })
        );
      }
    } else {
      children.push(
        new Paragraph({
          text: section.title.toUpperCase(),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 }
        })
      );

      if (section.type === 'summary') {
        children.push(
          new Paragraph({
            children: [new TextRun(section.items[0].text)],
            spacing: { after: 100 }
          })
        );
      } else if (section.type === 'skills') {
        const skillsText = section.items.map((i: any) => i.name).join(', ');
        children.push(
          new Paragraph({
            children: [new TextRun(skillsText)],
            spacing: { after: 100 },
            bullet: { level: 0 } // use bullets as requested
          })
        );
      } else if (section.type === 'experience') {
        for (const item of section.items) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: item.title, bold: true }),
                new TextRun({ text: ` | ${item.company} | ${item.date}` })
              ],
              spacing: { after: 50 }
            })
          );
          if (item.description) {
            children.push(
              new Paragraph({
                text: item.description,
                bullet: { level: 0 },
                spacing: { after: 100 }
              })
            );
          }
        }
      } else if (section.type === 'projects') {
        for (const item of section.items) {
          const techText = item.technologies ? ` (${item.technologies.join(', ')})` : '';
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: item.name, bold: true }),
                new TextRun({ text: techText })
              ],
              spacing: { after: 50 }
            })
          );
          if (item.description) {
            children.push(
              new Paragraph({
                text: item.description,
                bullet: { level: 0 },
                spacing: { after: 100 }
              })
            );
          }
        }
      } else if (section.type === 'education') {
        for (const item of section.items) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: item.degree, bold: true }),
                new TextRun({ text: ` | ${item.institution} | ${item.date}` })
              ],
              spacing: { after: 100 }
            })
          );
        }
      } else if (section.type === 'certifications') {
        for (const item of section.items) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: item.name, bold: true }),
                new TextRun({ text: ` | ${item.issuer} | ${item.date}` })
              ],
              spacing: { after: 100 }
            })
          );
        }
      } else {
        // Fallback for custom or unknown sections
        for (const item of section.items) {
          children.push(
            new Paragraph({
              children: [new TextRun(JSON.stringify(item))],
              spacing: { after: 100 }
            })
          );
        }
      }
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: children
    }],
  });

  return await Packer.toBuffer(doc);
}

export async function saveDocx(resume: ResumeDocument, outputPath: string): Promise<string> {
  const buffer = await generateDocx(resume);
  await fs.writeFile(outputPath, buffer);
  return outputPath;
}
