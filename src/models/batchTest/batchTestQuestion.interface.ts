import type { Types } from "mongoose";

export const BATCH_TEST_QUESTION_STATUS_VALUES = [
  "idle",
  "pending",
  "running",
  "completed",
  "failed",
] as const;

export type BatchTestQuestionStatus =
  (typeof BATCH_TEST_QUESTION_STATUS_VALUES)[number];

export const BATCH_TEST_ANSWERABILITY_VALUES = [
  "answerable",
  "not_answerable",
] as const;

export type BatchTestAnswerability =
  (typeof BATCH_TEST_ANSWERABILITY_VALUES)[number];

export const BATCH_TEST_RATING_VALUES = ["good", "passable", "poor"] as const;

export type BatchTestRating = (typeof BATCH_TEST_RATING_VALUES)[number];

export type BatchTestReferenceTopic = {
  id: string;
  name: string;
  articleId: string;
};

export type BatchTestReferenceArticle = {
  id: string;
  title: string;
};

export type BatchTestReferenceChunk = {
  id: string;
  topicId: string;
  articleId: string;
  preview: string;
};

export type BatchTestToolDeclared = {
  name: string;
  alias: string;
};

export type BatchTestToolCalled = {
  name: string;
  alias: string;
  ok: boolean;
  error?: string;
};

export type BatchTestGuidanceRef = {
  id: string;
  name: string;
};

export type BatchTestQuestionExecution = {
  runId: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type BatchTestQuestionReferences = {
  topics: BatchTestReferenceTopic[];
  articles: BatchTestReferenceArticle[];
  chunks: BatchTestReferenceChunk[];
};

export interface BatchTestQuestionInterface {
  groupId: Types.ObjectId;
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  questionText: string;
  order: number;
  status: BatchTestQuestionStatus;
  answer: string | null;
  answerability: BatchTestAnswerability | null;
  error: string | null;
  references: BatchTestQuestionReferences;
  toolsDeclared: BatchTestToolDeclared[];
  toolsCalled: BatchTestToolCalled[];
  guidanceDeclared: BatchTestGuidanceRef[];
  guidanceUsed: BatchTestGuidanceRef[];
  execution: BatchTestQuestionExecution;
  rating: BatchTestRating | null;
  createdAt: Date;
  updatedAt: Date;
}
