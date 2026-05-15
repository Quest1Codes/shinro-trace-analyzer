import jsPDF from 'jspdf';
import {
  PLEX_SANS_REGULAR,
  PLEX_SANS_BOLD,
  PLEX_MONO_REGULAR,
  PLEX_MONO_BOLD,
} from './pdfFontData';

export const FONT = {
  sans: 'IBMPlexSans',
  mono: 'IBMPlexMono',
} as const;

export function registerPdfFonts(doc: jsPDF) {
  doc.addFileToVFS('IBMPlexSans-Regular.ttf', PLEX_SANS_REGULAR);
  doc.addFont('IBMPlexSans-Regular.ttf', FONT.sans, 'normal');

  doc.addFileToVFS('IBMPlexSans-Bold.ttf', PLEX_SANS_BOLD);
  doc.addFont('IBMPlexSans-Bold.ttf', FONT.sans, 'bold');

  doc.addFileToVFS('IBMPlexMono-Regular.ttf', PLEX_MONO_REGULAR);
  doc.addFont('IBMPlexMono-Regular.ttf', FONT.mono, 'normal');

  doc.addFileToVFS('IBMPlexMono-Bold.ttf', PLEX_MONO_BOLD);
  doc.addFont('IBMPlexMono-Bold.ttf', FONT.mono, 'bold');
}
