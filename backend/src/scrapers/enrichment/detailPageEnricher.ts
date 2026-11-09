import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { RawJobData } from "../../types/job";
import { fetchUrl } from "../../utils/httpClient";
import { logger } from "../../utils/logger";
import { extractTitleAndRef } from "../../processors/titleProcessor";

/**
 * Generic detail page enricher that inspects detail URLs to extract and enrich:
 * - Clean Job Title & Job Reference / ID
 * - Specific Location (City, Town, Campus, Region)
 * - Complete Job Description
 * - Posted / Release Date
 * - Closing Date / Application Deadline
 * - Salary & Employment Type
 */
export async function enrichJobDetails(
  rawJobs: RawJobData[],
  companyName: string = "Company",
  concurrency: number = 8
): Promise<void> {
  if (!rawJobs || rawJobs.length === 0) return;

  const limit = pLimit(concurrency);
  logger.info(`Starting generic detail enrichment for ${rawJobs.length} job postings...`, companyName);

  await Promise.all(
    rawJobs.map((rawJob) =>
      limit(async () => {
        if (!rawJob.url && !rawJob.job_url && !rawJob.link) return;
        const targetUrl = rawJob.url || rawJob.job_url || rawJob.link;

        try {
          const detailRes = await fetchUrl(targetUrl, { timeout: 8000 });
          if (!detailRes.ok || typeof detailRes.data !== "string") return;

          const html = detailRes.data;
          const $ = cheerio.load(html);

          // 1. Initial title & reference cleanup from existing rawJob
          const initialTitleExtract = extractTitleAndRef(rawJob.title);
          if (initialTitleExtract.title && initialTitleExtract.title.length >= 3) {
            rawJob.title = initialTitleExtract.title;
          }
          if (initialTitleExtract.ref && (!rawJob.id && !rawJob.job_id)) {
            rawJob.job_id = initialTitleExtract.ref;
          }

          // 2. Check detail page heading (h1, .job-title, [itemprop="title"])
          const companyCandidates = [companyName, rawJob.company, rawJob.company_name]
            .filter(Boolean)
            .map((c) => String(c).toLowerCase().trim());

          const h1Candidate = $('[itemprop="title"], .job-title, .vacancy-title, #job-title, h1')
            .first()
            .text()
            .replace(/\s+/g, " ")
            .trim();

          const INVALID_HEADING_REGEX = /^(careers|vacancies|current vacancies|all vacancies|job details|vacancy details|apply now|welcome|search results|home|about us)$/i;
          const isCompanyNameHeading = companyCandidates.some(
            (c) =>
              h1Candidate.toLowerCase() === c ||
              (h1Candidate.toLowerCase().includes(c) && h1Candidate.length < c.length + 8)
          );

          if (
            h1Candidate &&
            h1Candidate.length >= 3 &&
            !INVALID_HEADING_REGEX.test(h1Candidate) &&
            !isCompanyNameHeading
          ) {
            const h1Extract = extractTitleAndRef(h1Candidate);
            if (h1Extract.title && h1Extract.title.length >= 3) {
              rawJob.title = h1Extract.title;
            }
            if (h1Extract.ref && (!rawJob.id && !rawJob.job_id)) {
              rawJob.job_id = h1Extract.ref;
            }
          }

          // 3. Structured JSON-LD extraction (JobPosting, WebPage, Article)
          $('script[type="application/ld+json"]').each((_, el) => {
            try {
              const rawJson = $(el).html() || "{}";
              const parsed = JSON.parse(rawJson);
              const items = Array.isArray(parsed)
                ? parsed
                : parsed["@graph"]
                ? parsed["@graph"]
                : [parsed];

              for (const item of items) {
                if (!item || typeof item !== "object") continue;

                const isJobPosting = item["@type"] === "JobPosting" || item["@type"]?.includes?.("JobPosting");
                const isPage = item["@type"] === "WebPage" || item["@type"] === "Article";

                // Date Posted / Published
                if (!rawJob.posted_date) {
                  const pDate = item.datePosted || (isPage && item.datePublished) || item.dateCreated;
                  if (pDate) rawJob.posted_date = String(pDate);
                }

                if (isJobPosting) {
                  // Job ID / Identifier
                  if (!rawJob.job_id && !rawJob.id) {
                    if (item.identifier) {
                      const idVal = typeof item.identifier === "object" ? item.identifier.value : item.identifier;
                      if (idVal) rawJob.job_id = String(idVal);
                    }
                  }

                  // Description
                  if (!rawJob.description && item.description) {
                    rawJob.description = $("<div>").html(item.description).text().trim() || item.description;
                  }

                  // Closing Date
                  if (!rawJob.closing_date && item.validThrough) {
                    rawJob.closing_date = item.validThrough;
                  }

                  // Employment Type
                  if (!rawJob.employment_type && item.employmentType) {
                    rawJob.employment_type = Array.isArray(item.employmentType)
                      ? item.employmentType.join(", ")
                      : item.employmentType;
                  }

                  // Location
                  if (!rawJob.location && item.jobLocation) {
                    const loc = Array.isArray(item.jobLocation) ? item.jobLocation[0] : item.jobLocation;
                    if (loc) {
                      const addr = loc.address;
                      if (addr) {
                        const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean);
                        if (parts.length > 0) rawJob.location = parts.join(", ");
                      } else if (loc.name) {
                        rawJob.location = loc.name;
                      }
                    }
                  }

                  // Salary
                  if (!rawJob.salary && item.baseSalary) {
                    if (typeof item.baseSalary === "object") {
                      const val = item.baseSalary.value;
                      const unit = item.baseSalary.currency || "";
                      if (val && typeof val === "object" && (val.minValue || val.maxValue || val.value)) {
                        if (val.minValue && val.maxValue) {
                          rawJob.salary = `${unit} ${val.minValue} - ${val.maxValue}`.trim();
                        } else {
                          rawJob.salary = `${unit} ${val.value || val.minValue || val.maxValue}`.trim();
                        }
                      } else if (typeof val === "string" || typeof val === "number") {
                        rawJob.salary = `${unit} ${val}`.trim();
                      }
                    } else if (typeof item.baseSalary === "string") {
                      rawJob.salary = item.baseSalary;
                    }
                  }
                }
              }
            } catch {}
          });

          // 4. OpenGraph / Meta Dates & Information
          if (!rawJob.posted_date) {
            const metaDate =
              $('meta[property="article:published_time"]').attr("content") ||
              $('meta[name="pubdate"]').attr("content") ||
              $('meta[property="og:updated_time"]').attr("content") ||
              $('meta[name="date"]').attr("content");
            if (metaDate) rawJob.posted_date = metaDate;
          }

          // 5. DOM Key-Value Extraction (Tables, Definition Lists, Lists, and Divs)
          const REF_REGEX = /^(?:reference|job\s*ref(?:erence)?|ref\s*no|job\s*id|requisition\s*(?:id|number)|req\s*id|vacancy\s*ref(?:erence)?|vacancy\s*id)[:\s]*(.*)$/i;
          const LOC_REGEX = /^(?:location|job\s*location|work\s*location|based\s*in|site|campus|workplace)[:\s]*(.*)$/i;
          const CLOSING_LABEL_REGEX = /^(?:closing\s*date|application\s*deadline|closes|deadline|expires|apply\s*by)[:\s]*(.*)$/i;
          const POSTED_LABEL_REGEX = /^(?:release\s*date|posted\s*date|date\s*posted|published|advertised|first\s*posted)[:\s]*(.*)$/i;
          const SALARY_REGEX = /^(?:salary|pay|package|remuneration|compensation)[:\s]*(.*)$/i;

          // (a) Table rows (e.g. <tr><th>Reference:</th><td>2203</td></tr>)
          $("tr").each((_, tr) => {
            const cells = $(tr).find("th, td");
            if (cells.length === 2) {
              const label = $(cells[0]).text().replace(/\s+/g, " ").trim();
              const val = $(cells[1]).text().replace(/\s+/g, " ").trim();

              if (!rawJob.job_id && !rawJob.id && REF_REGEX.test(label) && val) {
                rawJob.job_id = val;
              }
              if ((!rawJob.location || rawJob.location.toLowerCase() === "united kingdom") && LOC_REGEX.test(label) && val) {
                rawJob.location = val;
              }
              if (!rawJob.closing_date && CLOSING_LABEL_REGEX.test(label) && val) {
                rawJob.closing_date = val;
              }
              if (!rawJob.posted_date && POSTED_LABEL_REGEX.test(label) && val) {
                rawJob.posted_date = val;
              }
              if (!rawJob.salary && SALARY_REGEX.test(label) && val && /[\d£$€]/.test(val)) {
                rawJob.salary = val;
              }
            }
          });

          // (b) Definition lists (e.g. <dt>Reference</dt><dd>V/14367</dd>)
          $("dt").each((_, dt) => {
            const label = $(dt).text().replace(/\s+/g, " ").trim();
            const dd = $(dt).next("dd");
            if (dd.length > 0) {
              const val = dd.text().replace(/\s+/g, " ").trim();
              if (!rawJob.job_id && !rawJob.id && REF_REGEX.test(label) && val) {
                rawJob.job_id = val;
              }
              if ((!rawJob.location || rawJob.location.toLowerCase() === "united kingdom") && LOC_REGEX.test(label) && val) {
                rawJob.location = val;
              }
              if (!rawJob.closing_date && CLOSING_LABEL_REGEX.test(label) && val) {
                rawJob.closing_date = val;
              }
              if (!rawJob.posted_date && POSTED_LABEL_REGEX.test(label) && val) {
                rawJob.posted_date = val;
              }
              if (!rawJob.salary && SALARY_REGEX.test(label) && val && /[\d£$€]/.test(val)) {
                rawJob.salary = val;
              }
            }
          });

          // (c) List items, paragraphs, and metadata containers
          $("li, p, div, span").each((_, el) => {
            if ($(el).children().length > 3) return;
            const text = $(el).text().replace(/\s+/g, " ").trim();
            if (text.length === 0 || text.length > 200) return;

            // Job Title in metadata if heading was company name
            if ((!rawJob.title || isCompanyNameHeading) && /Job\s*Title[:\s]+/i.test(text)) {
              const tMatch = text.match(/Job\s*Title[:\s]+([^<\n|•]+)/i);
              if (tMatch && tMatch[1]) {
                const cleaned = extractTitleAndRef(tMatch[1].replace(/(?:Closing|Location|Salary|Department).*$/i, "").trim());
                if (cleaned.title && cleaned.title.length >= 3) {
                  rawJob.title = cleaned.title;
                }
              }
            }

            // Reference
            if (!rawJob.job_id && !rawJob.id) {
              const refMatch = text.match(/(?:Reference|Job\s*Ref(?:erence)?|Ref\s*No|Job\s*ID|Requisition\s*(?:ID|Number)|Req\s*ID|Vacancy\s*Ref(?:erence)?|Vacancy\s*ID)[:\s]+([A-Z0-9\/-]+)/i);
              if (refMatch && refMatch[1] && /\d/.test(refMatch[1])) {
                rawJob.job_id = refMatch[1].trim();
              }
            }

            // Location
            if (!rawJob.location || rawJob.location.toLowerCase() === "united kingdom") {
              const locMatch = text.match(/(?:Location|Job\s*Location|Work\s*Location|Based\s*In|Site|Campus)[:\s]+([^<\n|•]+)/i);
              if (locMatch && locMatch[1]) {
                const candLoc = locMatch[1].replace(/(?:Department|Closing|Job\s*Title|Salary|Apply).*$/i, "").trim();
                if (candLoc.length >= 2 && candLoc.length < 80) {
                  rawJob.location = candLoc;
                }
              }
            }

            // Closing Date: specific date pattern extraction
            if (!rawJob.closing_date) {
              const dateRegex = /(?:Closing\s*Date|Application\s*Deadline|Closes|Expires|Deadline|Apply\s*by)[:\s]+((?:[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+[0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2}))/i;
              const closingMatch = text.match(dateRegex);
              if (closingMatch && closingMatch[1]) {
                rawJob.closing_date = closingMatch[1].trim();
              }
            }

            // Posted Date: specific date pattern extraction
            if (!rawJob.posted_date) {
              const dateRegex = /(?:Release\s*Date|Posted\s*Date|Date\s*Posted|Published|Advertised|First\s*Posted)[:\s]+((?:[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+[0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2}))/i;
              const postMatch = text.match(dateRegex);
              if (postMatch && postMatch[1]) {
                rawJob.posted_date = postMatch[1].trim();
              }
            }

            // Salary
            if (!rawJob.salary) {
              const salMatch = text.match(/(?:Salary|Pay|Package|Remuneration|Compensation)[:\s]+([^<\n|•]+)/i);
              if (salMatch && salMatch[1] && /[\d£$€]/.test(salMatch[1])) {
                rawJob.salary = salMatch[1].replace(/(?:Closing|Department|Job\s*Title|Location|Apply).*$/i, "").trim();
              }
            }

            // Employment Type
            if (!rawJob.employment_type) {
              const empMatch = text.match(/(?:Contract\s*Type|Employment\s*Type|Working\s*Pattern)[:\s]+([^<\n|•]+)/i);
              if (empMatch && empMatch[1]) {
                rawJob.employment_type = empMatch[1].replace(/(?:Closing|Department|Salary|Location).*$/i, "").trim();
              }
            }
          });

          // 6. Complete Job Description Extraction
          if (!rawJob.description || rawJob.description.trim().length < 80) {
            const desc$ = cheerio.load(html);
            desc$("script, style, noscript, nav, header, footer, .footer, .header, .nav, .cookie, .share, .similar-jobs, .related-jobs, .social-share").remove();

            // First: structured container selectors
            const descSelectors = [
              '[itemprop="description"]',
              ".job-description",
              "#job-description",
              ".jobsearch-description",
              ".vacancy-description",
              ".vacancy-desc",
              ".job-details",
              ".job-details-content",
              ".job-detail",
              ".job-body",
              ".job-post-content",
              ".job_description",
              ".entry-content",
              "article",
            ];

            for (const sel of descSelectors) {
              const el = desc$(sel).first();
              if (el.length > 0) {
                const txt = el.text().replace(/\s+/g, " ").trim();
                if (txt.length >= 100) {
                  rawJob.description = txt;
                  break;
                }
              }
            }

            // Second: search for heading "Job Description", "About the Role", etc. and gather subsequent content
            if (!rawJob.description || rawJob.description.trim().length < 80) {
              desc$("h1, h2, h3, h4").each((_, head) => {
                if (rawJob.description && rawJob.description.length >= 100) return;
                const hText = desc$(head).text().trim();
                if (/(?:Job\s*Description|About\s*(?:the|this)\s*(?:Role|Job|Position)|Responsibilities|Overview|The\s*Role)/i.test(hText)) {
                  let accumulated = "";
                  let next = desc$(head).next();
                  while (next.length > 0 && !/^h[1-3]$/i.test(next.prop("tagName") || "")) {
                    accumulated += " " + next.text().replace(/\s+/g, " ").trim();
                    next = next.next();
                    if (accumulated.length > 3000) break;
                  }
                  if (accumulated.trim().length >= 100) {
                    rawJob.description = accumulated.trim();
                  }
                }
              });
            }

            // Third generic fallback: gather substantive paragraphs (<p>) from the entire body
            if (!rawJob.description || rawJob.description.trim().length < 80) {
              const pTexts: string[] = [];
              desc$("p").each((_, p) => {
                const txt = desc$(p).text().replace(/\s+/g, " ").trim();
                if (
                  txt.length >= 40 &&
                  !/cookie|privacy policy|terms of use|all rights reserved|javascript:__doPostBack/i.test(txt)
                ) {
                  pTexts.push(txt);
                }
              });

              if (pTexts.length > 0) {
                const combined = pTexts.join("\n\n");
                if (combined.length >= 100) {
                  rawJob.description = combined;
                }
              }
            }
          }

          // 7. Inline description location fallback (e.g. "team based in Clacton-on-Sea")
          if ((!rawJob.location || rawJob.location.toLowerCase() === "united kingdom") && rawJob.description) {
            const inlineMatch = rawJob.description.match(/(?:friendly team based in|team based in|based in|located in|working in|position based at|office in)\s+([A-Z][a-zA-Z\s-]+(?:-on-[A-Z][a-zA-Z-]+)?(?:,\s*[A-Z][a-zA-Z\s]+)?)/i);
            if (inlineMatch && inlineMatch[1] && inlineMatch[1].trim().length < 50) {
              rawJob.location = inlineMatch[1].trim().replace(/[.,;]+$/, "");
            }
          }

          // 8. Requirements extraction if missing
          if (!rawJob.requirements && rawJob.description) {
            const reqPatterns = [
              /(?:Requirements|Qualifications|What you(?:'ll| will) need|Person Specification|Key Responsibilities|As a [^\n]+ you will:?)[\s\S]*?(?=(?:Benefits|For you|Supporting your growth|About us|How to apply|$))/i,
              /(?:Key Duties|Responsibilities|Duties and Responsibilities)[\s\S]*?(?=(?:Benefits|For you|Supporting your growth|About us|How to apply|$))/i,
            ];
            for (const pat of reqPatterns) {
              const m = rawJob.description.match(pat);
              if (m && m[0].trim().length > 30) {
                rawJob.requirements = m[0].trim();
                break;
              }
            }
          }
        } catch (err: any) {
          logger.warn(`Detail enrichment error on ${targetUrl}: ${err.message}`, companyName);
        }
      })
    )
  );

  logger.info(`Completed detail enrichment for ${rawJobs.length} postings.`, companyName);
}
