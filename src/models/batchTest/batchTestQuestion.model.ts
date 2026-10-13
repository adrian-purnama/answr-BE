import { Schema, model } from "mongoose";
import {
  BATCH_TEST_ANSWERABILITY_VALUES,
  BATCH_TEST_QUESTION_STATUS_VALUES,
  BATCH_TEST_RATING_VALUES,
  type BatchTestQuestionInterface,
} from "./batchTestQuestion.interface";

const BatchTestQuestionSchema = new Schema<BatchTestQuestionInterface>(
  {
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "BatchTestGroup",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    apiKeyId: {
      type: Schema.Types.ObjectId,
      ref: "ApiKey",
      required: true,
    },
    questionText: {
      type: String,
      required: true,
      trim: true,
    },
    order: {
      type: Number,
      required: true,
      default: 0,
    },
    status: {
      type: String,
      enum: BATCH_TEST_QUESTION_STATUS_VALUES,
      required: true,
      default: "idle",
    },
    answer: {
      type: String,
      required: false,
      default: null,
    },
    answerability: {
      type: String,
      enum: BATCH_TEST_ANSWERABILITY_VALUES,
      required: false,
      default: null,
    },
    error: {
      type: String,
      required: false,
      default: null,
    },
    references: {
      topics: {
        type: [
          {
            id: { type: String, required: true },
            name: { type: String, required: true },
            articleId: { type: String, required: true },
          },
        ],
        default: [],
      },
      articles: {
        type: [
          {
            id: { type: String, required: true },
            title: { type: String, required: true },
          },
        ],
        default: [],
      },
      chunks: {
        type: [
          {
            id: { type: String, required: true },
            topicId: { type: String, required: true },
            articleId: { type: String, required: true },
            preview: { type: String, required: true },
          },
        ],
        default: [],
      },
    },
    toolsDeclared: {
      type: [
        {
          name: { type: String, required: true },
          alias: { type: String, required: true },
        },
      ],
      default: [],
    },
    toolsCalled: {
      type: [
        {
          name: { type: String, required: true },
          alias: { type: String, required: true },
          ok: { type: Boolean, required: true },
          error: { type: String, required: false },
        },
      ],
      default: [],
    },
    guidanceDeclared: {
      type: [
        {
          id: { type: String, required: true },
          name: { type: String, required: true },
        },
      ],
      default: [],
    },
    guidanceUsed: {
      type: [
        {
          id: { type: String, required: true },
          name: { type: String, required: true },
        },
      ],
      default: [],
    },
    execution: {
      runId: { type: String, required: false, default: null },
      startedAt: { type: Date, required: false, default: null },
      finishedAt: { type: Date, required: false, default: null },
    },
    rating: {
      type: String,
      enum: BATCH_TEST_RATING_VALUES,
      required: false,
      default: null,
    },
  },
  { timestamps: true },
);

BatchTestQuestionSchema.index({ groupId: 1, userId: 1, apiKeyId: 1 });
BatchTestQuestionSchema.index({ userId: 1, apiKeyId: 1 });
BatchTestQuestionSchema.index({ groupId: 1, order: 1, createdAt: 1 });

export const BatchTestQuestionModel = model<BatchTestQuestionInterface>(
  "BatchTestQuestion",
  BatchTestQuestionSchema,
);
