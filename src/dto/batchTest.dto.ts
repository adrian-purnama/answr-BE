import type {
  BatchTestAnswerability,
  BatchTestGuidanceRef,
  BatchTestQuestionExecution,
  BatchTestQuestionReferences,
  BatchTestQuestionStatus,
  BatchTestRating,
  BatchTestToolCalled,
  BatchTestToolDeclared,
} from "../models/batchTest/batchTestQuestion.interface";
import type { BatchTestGroupRunStatus } from "../models/batchTest/batchTestGroup.interface";

export type CreateBatchTestGroupDto = {
  apiKeyId: string;
  name: string;
};

export type UpdateBatchTestGroupDto = {
  name: string;
};

export type CreateBatchTestQuestionDto = {
  questionText: string;
};

export type UpdateBatchTestQuestionDto = {
  questionText: string;
};

export type BulkBatchTestQuestionIdsDto = {
  questionIds: string[];
};

export type SetBatchTestRatingDto = {
  rating: BatchTestRating;
};

export type BatchTestGroupProgressDto = {
  total: number;
  completed: number;
  failed: number;
};

export type BatchTestQuestionExecutionDto = {
  runId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type BatchTestQuestionOutDto = {
  id: string;
  groupId: string;
  apiKeyId: string;
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
  execution: BatchTestQuestionExecutionDto;
  rating: BatchTestRating | null;
  createdAt: string;
  updatedAt: string;
};

export type BatchTestGroupSummaryDto = {
  answerable: number;
  notAnswerable: number;
  good: number;
  passable: number;
  poor: number;
};

export type BatchTestGroupOutDto = {
  id: string;
  apiKeyId: string;
  name: string;
  runStatus: BatchTestGroupRunStatus;
  progress: BatchTestGroupProgressDto;
  lastRunAt: string | null;
  latestRunId: string | null;
  questionCount: number;
  summary: BatchTestGroupSummaryDto;
  createdAt: string;
  updatedAt: string;
};

export type BatchTestGroupDetailOutDto = BatchTestGroupOutDto & {
  questions: BatchTestQuestionOutDto[];
};

export type BatchTestGroupProgressOutDto = {
  id: string;
  runStatus: BatchTestGroupRunStatus;
  progress: BatchTestGroupProgressDto;
  lastRunAt: string | null;
  latestRunId: string | null;
  questions: BatchTestQuestionOutDto[];
};

export type { BatchTestQuestionExecution };
