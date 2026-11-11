import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  int,
  json,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const uploadedFiles = mysqlTable(
  "uploaded_files",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 150 }).notNull(),
    fileExtension: varchar("file_extension", { length: 16 }).notNull(),
    fileSize: int("file_size").notNull(),
    s3Bucket: varchar("s3_bucket", { length: 255 }),
    s3Key: varchar("s3_key", { length: 512 }),
    s3Etag: varchar("s3_etag", { length: 128 }),
    storageStatus: varchar("storage_status", { length: 32 }).notNull().default("stored"),
    detectedColumn: varchar("detected_column", { length: 100 }),
    detectedSheet: varchar("detected_sheet", { length: 150 }),
    totalRows: int("total_rows").notNull().default(0),
    validCount: int("valid_count").notNull().default(0),
    invalidCount: int("invalid_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    createdAtIdx: index("idx_uploaded_files_created_at").on(table.createdAt),
    s3KeyIdx: index("idx_uploaded_files_s3_key").on(table.s3Key),
  })
);

export const uploadedFileRows = mysqlTable(
  "uploaded_file_rows",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    fileId: varchar("file_id", { length: 36 })
      .notNull()
      .references(() => uploadedFiles.id, { onDelete: "cascade" }),
    rowNumber: int("row_number").notNull(),
    isValid: boolean("is_valid").notNull().default(true),
    invalidReason: text("invalid_reason"),
    externalId: varchar("external_id", { length: 100 }),
    companyName: varchar("company_name", { length: 255 }),
    companyUrl: text("company_url"),
    careerUrl: text("career_url"),
    ats: varchar("ats", { length: 100 }),
    slug: varchar("slug", { length: 255 }),
    industry: varchar("industry", { length: 150 }),
    city: varchar("city", { length: 150 }),
    state: varchar("state", { length: 150 }),
    country: varchar("country", { length: 150 }),
    rawData: json("raw_data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    fileValidIdx: index("idx_uploaded_file_rows_file_valid").on(table.fileId, table.isValid),
    fileRowNumberIdx: index("idx_uploaded_file_rows_file_row").on(table.fileId, table.rowNumber),
  })
);

export const uploadedFilesRelations = relations(uploadedFiles, ({ many }) => ({
  rows: many(uploadedFileRows),
}));

export const uploadedFileRowsRelations = relations(uploadedFileRows, ({ one }) => ({
  file: one(uploadedFiles, {
    fields: [uploadedFileRows.fileId],
    references: [uploadedFiles.id],
  }),
}));

export type UploadedFileRecord = typeof uploadedFiles.$inferSelect;
export type NewUploadedFileRecord = typeof uploadedFiles.$inferInsert;
export type UploadedFileRowRecord = typeof uploadedFileRows.$inferSelect;
export type NewUploadedFileRowRecord = typeof uploadedFileRows.$inferInsert;
