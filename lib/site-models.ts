

import { constants } from "node:fs";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

type MapPosition = {
  x: number;
  y: number;
};

type MapSize = {
  width: number;
  height: number;
};

type SiteModelCopy = {
  label: string;
  summary: string;
  verse: string;
  interpretation: string;
  overviewMeta: string;
  overviewTag: string;
  overviewCopy: string;
  overviewHint: string;
};

type SiteModelPlacement = {
  slug: string;
  mapPosition: MapPosition;
  mapSize: MapSize;
};

type SiteModelRecord = SiteModelPlacement & SiteModelCopy;

export type SiteModelSummary = SiteModelRecord & {
  fileName: string;
};

export type SiteModelAsset = SiteModelSummary & {
  filePath: string;
};

const GLB_DIRECTORY = path.join(process.cwd(), "glbfile");
const LOCATION_IMAGE_PATH = path.join(GLB_DIRECTORY, "location.png");
const SITE_MODEL_COPY_CONFIG_PATH = path.join(
  process.cwd(),
  "config",
  "site-model-content.json"
);
const SAFE_SLUG_PATTERN = /^[a-z0-9-]+$/;

// This order drives both the directory and previous/next model navigation.
const SITE_MODEL_PLACEMENTS: readonly SiteModelPlacement[] = [
  {
    slug: "linglongguan",
    mapPosition: { x: 0.807, y: 0.7078 },
    mapSize: { width: 0.056, height: 0.05 },
  },
  {
    slug: "yuanxiangtang",
    mapPosition: { x: 0.6624, y: 0.6261 },
    mapSize: { width: 0.064, height: 0.042 },
  },
  {
    slug: "xiaofeihong",
    mapPosition: { x: 0.5515, y: 0.7352 },
    mapSize: { width: 0.05, height: 0.036 },
  },
  {
    slug: "xiangzhou",
    mapPosition: { x: 0.4898, y: 0.6266 },
    mapSize: { width: 0.052, height: 0.04 },
  },
  {
    slug: "yulantang",
    mapPosition: { x: 0.4058, y: 0.7141 },
    mapSize: { width: 0.064, height: 0.042 },
  },
  {
    slug: "jianshanlou",
    mapPosition: { x: 0.478, y: 0.333 },
    mapSize: { width: 0.068, height: 0.06 },
  },
  {
    slug: "hefengsimianting",
    mapPosition: { x: 0.5423, y: 0.5004 },
    mapSize: { width: 0.072, height: 0.042 },
  },
  {
    slug: "xuexiangyunweiting",
    mapPosition: { x: 0.6068, y: 0.3984 },
    mapSize: { width: 0.09, height: 0.06 },
  },
] as const;

const placementBySlug = new Map(
  SITE_MODEL_PLACEMENTS.map((placement) => [placement.slug, placement] as const)
);

const DEFAULT_MAP_SIZE: MapSize = {
  width: 0.06,
  height: 0.04,
};

const DEFAULT_COPY_FALLBACKS = {
  summary: "根据文件名识别出的单体模型。",
  verse: "尚待题咏，留与后来人。",
  interpretation: "此处模型尚未补入对应解说。",
  overviewMeta: "",
  overviewTag: "【待补】",
  overviewCopy: "此处模型尚未补入导览文案。",
  overviewHint: "轻触可进入模型页面查看。",
} satisfies Omit<SiteModelCopy, "label">;

const SITE_MODEL_COPY_FIELDS = [
  "label",
  "summary",
  "verse",
  "interpretation",
  "overviewMeta",
  "overviewTag",
  "overviewCopy",
  "overviewHint",
] as const satisfies readonly (keyof SiteModelCopy)[];

function toFileName(slug: string) {
  return `${slug}.glb`;
}

function toFallbackLabel(slug: string) {
  return slug
    .split("-")
    .map((segment) => segment.slice(0, 1).toUpperCase() + segment.slice(1))
    .join(" ");
}

function toFallbackPosition(index: number, total: number): MapPosition {
  return {
    x: (index + 1) / (total + 1),
    y: 0.93,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickSiteModelCopyFields(
  value: Record<string, unknown>
): Partial<SiteModelCopy> {
  const copy: Partial<SiteModelCopy> = {};

  for (const field of SITE_MODEL_COPY_FIELDS) {
    const fieldValue = value[field];

    if (typeof fieldValue === "string") {
      copy[field] = fieldValue;
    }
  }

  return copy;
}

function toSiteModelCopy(
  slug: string,
  configuredCopy: Partial<SiteModelCopy> | undefined,
  fallbackOverrides: Partial<Omit<SiteModelCopy, "label">> = {}
): SiteModelCopy {
  const fallbacks = {
    ...DEFAULT_COPY_FALLBACKS,
    ...fallbackOverrides,
  };

  return {
    label: configuredCopy?.label ?? toFallbackLabel(slug),
    summary: configuredCopy?.summary ?? fallbacks.summary,
    verse: configuredCopy?.verse ?? fallbacks.verse,
    interpretation: configuredCopy?.interpretation ?? fallbacks.interpretation,
    overviewMeta: configuredCopy?.overviewMeta ?? fallbacks.overviewMeta,
    overviewTag: configuredCopy?.overviewTag ?? fallbacks.overviewTag,
    overviewCopy: configuredCopy?.overviewCopy ?? fallbacks.overviewCopy,
    overviewHint: configuredCopy?.overviewHint ?? fallbacks.overviewHint,
  };
}

function toSiteModelRecord(
  slug: string,
  configuredCopy: Partial<SiteModelCopy> | undefined,
  mapPosition: MapPosition,
  mapSize: MapSize,
  fallbackOverrides?: Partial<Omit<SiteModelCopy, "label">>
): SiteModelRecord {
  return {
    slug,
    ...toSiteModelCopy(slug, configuredCopy, fallbackOverrides),
    mapPosition,
    mapSize,
  };
}

async function getSiteModelCopyBySlug() {
  const source = await readFile(SITE_MODEL_COPY_CONFIG_PATH, "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return "{}";
      }

      throw error;
    }
  );
  const parsed = JSON.parse(source) as unknown;

  if (!isPlainObject(parsed)) {
    return new Map<string, Partial<SiteModelCopy>>();
  }

  const entries = Object.entries(parsed).flatMap(([slug, value]) => {
    if (!SAFE_SLUG_PATTERN.test(slug) || !isPlainObject(value)) {
      return [];
    }

    return [[slug, pickSiteModelCopyFields(value)] as const];
  });

  return new Map<string, Partial<SiteModelCopy>>(entries);
}

export function getLocationImagePath() {
  return LOCATION_IMAGE_PATH;
}

export async function getAvailableSiteModels(): Promise<SiteModelSummary[]> {
  const [entries, copyBySlug] = await Promise.all([
    readdir(GLB_DIRECTORY, { withFileTypes: true }).catch(() => []),
    getSiteModelCopyBySlug(),
  ]);
  const discoveredSlugs = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".glb"))
    .map((entry) => entry.name.slice(0, -4));
  const discoveredSlugSet = new Set(discoveredSlugs);

  const knownModels = SITE_MODEL_PLACEMENTS.filter((placement) =>
    discoveredSlugSet.has(placement.slug)
  ).map((placement) => ({
    ...toSiteModelRecord(
      placement.slug,
      copyBySlug.get(placement.slug),
      placement.mapPosition,
      placement.mapSize
    ),
    fileName: toFileName(placement.slug),
  }));

  const unknownSlugs = discoveredSlugs
    .filter((slug) => !placementBySlug.has(slug))
    .sort((left, right) => left.localeCompare(right));

  const unknownModels = unknownSlugs.map((slug, index) => ({
    ...toSiteModelRecord(
      slug,
      copyBySlug.get(slug),
      toFallbackPosition(index, unknownSlugs.length),
      DEFAULT_MAP_SIZE,
      {
        summary: "已发现模型文件，但尚未配置园区里的精确位置。",
      }
    ),
    fileName: toFileName(slug),
  }));

  return [...knownModels, ...unknownModels];
}

export async function getSiteModelAsset(
  slug: string
): Promise<SiteModelAsset | null> {
  if (!SAFE_SLUG_PATTERN.test(slug)) {
    return null;
  }

  const filePath = path.join(GLB_DIRECTORY, toFileName(slug));

  try {
    await access(filePath, constants.R_OK);
  } catch {
    return null;
  }

  const placement = placementBySlug.get(slug);
  const copyBySlug = await getSiteModelCopyBySlug();

  return {
    ...toSiteModelRecord(
      slug,
      copyBySlug.get(slug),
      placement?.mapPosition ?? { x: 0.5, y: 0.93 },
      placement?.mapSize ?? DEFAULT_MAP_SIZE
    ),
    fileName: toFileName(slug),
    filePath,
  };
}
