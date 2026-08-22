"use client";

import { createContext, useContext } from "react";

import type { ExamColourTheme, ExamFontSize } from "@/lib/config";

export type StoredHighlight = {
  id: string;
  questionGroupId: string;
  region: string;
  text: string;
  occurrence: number;
  colour: string;
};

export type ExamToolsValue = {
  fontSize: ExamFontSize;
  setFontSize: (size: ExamFontSize) => void;
  colourTheme: ExamColourTheme;
  setColourTheme: (theme: ExamColourTheme) => void;
  highlightMode: boolean;
  setHighlightMode: (on: boolean) => void;
  highlightsForRegion: (region: string) => StoredHighlight[];
  addHighlight: (highlight: Omit<StoredHighlight, "id" | "questionGroupId">) => void;
  removeHighlight: (id: string) => void;
  /** False during reading time — every answer control is disabled. */
  answeringEnabled: boolean;
};

const ExamToolsContext = createContext<ExamToolsValue | null>(null);

export const ExamToolsProvider = ExamToolsContext.Provider;

export function useExamTools(): ExamToolsValue {
  const value = useContext(ExamToolsContext);
  if (!value) {
    throw new Error("useExamTools must be used inside the exam shell");
  }
  return value;
}
