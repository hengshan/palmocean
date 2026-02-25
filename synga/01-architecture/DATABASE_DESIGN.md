# PalmView GeoAI Platform — Database Design Document

> **Version**: 2.1.0-draft  
> **Author**: SYNGA Database Architecture Team  
> **Date**: 2026-02-20  
> **Status**: Proposal — Ready for Implementation Review

---

## Table of Contents

1. [High-Level Architecture (高层架构)](#a-high-level-architecture)
2. [Conceptual Data Model & ERD (概念数据模型)](#b-conceptual-data-model--erd)
3. [Complete PostgreSQL Schema Proposal (完整 Schema 提案)](#c-complete-postgresql-schema-proposal)
4. [Design Rationale (设计原理)](#d-design-rationale)
5. [MVP Subset & Phase 2 Expansion (MVP 与扩展)](#e-mvp-subset--phase-2-expansion)
6. [Implementation Order (落地次序)](#h-implementation-order--落地次序kepler-first-最短路径)
7. [JSON Schemas (示例 JSON)](#f-json-schemas)
8. [Initial DDL Skeleton (DDL 骨架)](#g-initial-ddl-skeleton)

---

## A) High-Level Architecture

### A1. System Boundaries & Storage Responsibilities — 系统边界与存储职责

```
┌──────────────────────────────────────────────────────────────────────┐
│                   PostgreSQL / PostGIS (System of Record)            │
│                                                                      │
│  元数据 + 工作流状态 + 版本链 + 权限审计 + 空间索引 + 轻量级几何      │
│                                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Tenancy  │ │ Projects │ │ Imagery  │ │ Model    │ │Inference │  │
│  │ & RBAC   │ │ & Assets │ │ Assets   │ │ Registry │ │ Workflow │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │ STAC     │ │ GEE      │ │Annotation│ │ Kepler   │               │
│  │ Integ.   │ │ Integ.   │ │ & Review │ │ Configs  │               │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘               │
│  ┌──────────┐                                                       │
│  │ Robot/   │   PgSTAC (schema `pgstac`): items, collections       │
│  │ IoT      │                                                       │
│  └──────────┘                                                       │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                     S3 / MinIO Object Store (Heavy Data)             │
│                                                                      │
│  • COG (Cloud-Optimized GeoTIFF) — raster imagery & inference       │
│  • GeoParquet — large vector datasets, training snapshots           │
│  • PMTiles — pre-generated vector/raster tile archives              │
│  • Model artifacts (weights, ONNX, TorchScript)                     │
│  • Annotation exports (COCO JSON, GeoJSON bundles)                  │
│  • Raw uploads (drone imagery, sensor data)                         │
│  • Telemetry archives (Parquet time-series)                         │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    Tile / Serving Layer                               │
│                                                                      │
│  • Vector MVT / PMTiles — Martin (PostGIS) or static PMTiles        │
│  • Raster WMTS / XYZ — TiTiler (dynamic slicing from COG on S3)    │
│  • CDN caching in front of tile endpoints                           │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│           STAC Integration                    GEE Integration        │
│                                                                      │
│  Internal: PgSTAC backend              Virtual compute source        │
│  External: stac_remotes + cache        → materialize to COG/tiles/   │
│  → imagery_assets 统一入口               GeoParquet → imagery_assets │
└──────────────────────────────────────────────────────────────────────┘
```

### A2. Storage Decision Matrix — 什么存在哪里

| 存储位置 | 内容 | 原因 |
|---------|------|------|
| **PostgreSQL** | 元数据、关系、索引、权限（RLS）、工作流状态、版本链、轻量级几何（ROI polygons, annotation features, mission tracks） | 事务一致性、关系查询、RLS 隔离、空间索引 |
| **Object Store** | COG、GeoParquet、PMTiles、模型权重、训练快照、遥测归档 | 成本低 (~$0.023/GB/月)、无限扩展、HTTP Range 读取、CDN 友好 |
| **Tile Server** | 动态瓦片渲染 (TiTiler for raster, Martin for vector) | Kepler/MapLibre 消费、按需渲染、无需预生成 |
| **STAC API** | 时空资产目录（PgSTAC backend）| 标准化发现接口、跨系统互操作 |
| **GEE** | 虚拟计算源，按需物化 | 避免预存所有卫星数据，按需导出到内部存储 |

### A3. Key Architectural Concept: `imagery_assets` as Unified Business Asset Hub

```
                    ┌─────────────────────────────┐
                    │      imagery_assets          │
                    │   (Unified Asset Registry)   │
                    │                              │
  source_type:      │  asset_id  ←── 业务主键      │
  ┌─────────┐       │  source_type                 │
  │internal │──────▶│  uri (S3)                    │◀──── inference_outputs
  │ upload  │       │  stac_link_id ──▶ stac_...   │◀──── gee_exports
  └─────────┘       │  gee_export_id ──▶ gee_...   │◀──── annotation_tasks
  ┌─────────┐       │  footprint (geom)            │◀──── map_config dataset_refs
  │  STAC   │──────▶│  acquired_at                 │
  │ cached  │       │  gsd_cm, bands, crs          │
  └─────────┘       │                              │
  ┌─────────┐       └─────────────────────────────┘
  │  GEE    │──────▶  所有下游只需引用 asset_id
  │exported │        无需关心数据来源
  └─────────┘
```

> **核心理念**：`imagery_assets` 是所有影像/数据产品的统一业务入口。无论数据来自直接上传、STAC 目录还是 GEE 导出，下游（推理、标注、地图配置）都通过 `asset_id` 引用，实现 source-agnostic 的数据消费。

---

## B) Conceptual Data Model & ERD

### B1. Domain Relationship Map — 域间关系总览

```
                              ┌─────────────┐
                              │  Domain 1   │
                              │ Tenancy &   │
                              │  Access     │
                              │─────────────│
                              │ orgs        │
                              │ users       │
                              │ memberships │
                              │ roles       │
                              │ api_keys    │
                              │ audit_logs  │
                              │ quotas      │
                              └──────┬──────┘
                                     │ org_id permeates ALL
                      ┌──────────────┼──────────────┐
                      ▼              ▼               ▼
              ┌──────────────┐ ┌──────────┐  ┌──────────────┐
              │   Domain 2   │ │ Domain 8 │  │   Domain 9   │
              │  Projects &  │ │  Kepler  │  │  Robot/IoT   │
              │Spatial Assets│ │  Configs │  │  Extension   │
              │──────────────│ │──────────│  │──────────────│
              │ projects     │ │map_configs│ │ device_types │
              │ project_     │ │map_config│  │ devices      │
              │  memberships │ │ _releases│  │ missions     │
              │ farms        │ │map_config│  │ mission_     │
              │ blocks       │ │ _shares  │  │  tracks      │
              │ rois         │ └─────┬────┘  │ mission_     │
              │ tags/taggings│       │       │  events      │
              └──────┬───────┘       │       │ telemetry_   │
                     │               │       │  refs        │
          ┌──────────┼────────┐      │       └──────┬───────┘
          ▼          ▼        ▼      │              │
    ┌──────────┐ ┌──────┐ ┌──────────────┐         │
    │ Domain 3 │ │ D4   │ │   Domain 5   │         │
    │   STAC   │ │ GEE  │ │   Imagery    │◀────────┘
    │  Integ.  │ │Integ.│ │   Assets     │
    │──────────│ │──────│ │──────────────│
    │stac_     │ │gee_  │ │imagery_assets│ ◀── unified hub
    │ remotes  │ │source│ └──────┬───────┘
    │stac_asset│ │gee_  │        │
    │ _links   │ │export│        ▼
    └────┬─────┘ └──┬───┘  ┌──────────────┐  ┌──────────────┐
         │          │      │   Domain 6   │  │   Domain 7   │
         └──────────┴─────▶│  Inference   │  │  Annotation  │
            via asset_id   │  Workflow    │  │  & Review    │
                           │─────────────│  │──────────────│
                           │inference_   │  │annot_tasks   │
                           │  jobs       │  │annot_sets    │
                           │job_runs     │  │annot_commits │
                           │inference_   │  │annot_features│
                           │  outputs    │  │training_     │
                           │result_index │  │  snapshots   │
                           └─────────────┘  └──────────────┘
                                 │                 │
                                 └──────┬──────────┘
                                        ▼
                                 ┌──────────────┐
                                 │  Domain 6b   │
                                 │   Model      │
                                 │  Registry    │
                                 │──────────────│
                                 │ models       │
                                 │ model_       │
                                 │  versions    │
                                 └──────────────┘
```

### B2. Cross-Domain Foreign Key Summary — 跨域外键

| From | To | FK | Relationship |
|------|----|----|-------------|
| `projects` | `orgs` | `org_id` | 项目属于组织 |
| `project_memberships` | `projects`, `users` | `project_id`, `user_id` | 项目级权限 |
| `farms` | `projects` | `project_id` | 农场属于项目 |
| `blocks` | `farms` | `farm_id` | 地块属于农场 |
| `rois` | `projects` | `project_id` | ROI 属于项目 |
| `stac_remotes` | `projects` | `project_id` | 外部 STAC 源属于项目 |
| `stac_asset_links` | `projects`, `imagery_assets` | `project_id`, `asset_id` | STAC 链接桥接 |
| `gee_sources` | `projects` | `project_id` | GEE 源属于项目 |
| `gee_exports` | `gee_sources`, `rois`, `imagery_assets` | FKs | GEE 导出产生资产 |
| `imagery_assets` | `projects` | `project_id` | **统一资产中心** |
| `inference_jobs` | `projects`, `model_versions`, `imagery_assets`, `rois` | FKs | 推理关联项目、模型、资产 |
| `inference_outputs` | `job_runs` | `run_id` | 输出属于运行 |
| `annotation_tasks` | `projects`, `imagery_assets` | `project_id`, `asset_id` | 标注基于资产 |
| `training_snapshots` | `annotation_sets`, `annotation_commits` | FKs | 快照锁定标注版本 |
| `map_configs` | `projects` | `project_id` | 地图配置属于项目 |
| `missions` | `projects`, `devices`, `rois` | FKs | 任务关联多个域 |

---

## C) Complete PostgreSQL Schema Proposal

### Conventions — 命名规范

- **表名**: 复数, snake_case (e.g., `inference_jobs`)
- **主键**: `{entity}_id UUID DEFAULT gen_random_uuid()` — 使用实体名前缀（`org_id`, `project_id`, `asset_id`），提高 JOIN 可读性
- **时间戳**: `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ DEFAULT now()`
- **软删除**: 仅在需要的表上用 `deleted_at TIMESTAMPTZ`
- **多租户**: 每张业务表含 `org_id UUID NOT NULL REFERENCES orgs(org_id)`
- **几何列**: `geometry(Type, 4326)` with GiST index
- **JSONB**: 用于半结构化扩展字段 (`props JSONB DEFAULT '{}'`)
- **Status**: 用 `VARCHAR` 不用 `ENUM`（ALTER TYPE ADD VALUE 不可回滚）

### Extensions Required

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
-- PgSTAC installs its own extensions in `pgstac` schema
```

---

### Domain 1: Tenancy & Access Control — 租户与访问控制

#### `orgs` — 组织/租户

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `org_id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `name` | VARCHAR(255) | NOT NULL | 组织名称 |
| `slug` | VARCHAR(100) | UNIQUE, NOT NULL | URL-safe 标识 |
| `plan` | VARCHAR(50) | DEFAULT 'free' | 订阅计划 (free/pro/enterprise) |
| `settings` | JSONB | DEFAULT '{}' | 组织级设置 |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |
| `deleted_at` | TIMESTAMPTZ | | 软删除 |

#### `users` — 用户

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `user_id` | UUID | PK | |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | |
| `name` | VARCHAR(255) | | 显示名 |
| `avatar_url` | TEXT | | |
| `auth_provider` | VARCHAR(50) | NOT NULL | oauth provider |
| `auth_subject` | VARCHAR(255) | NOT NULL | provider subject ID |
| `is_superadmin` | BOOLEAN | DEFAULT false | 平台超管 |
| `last_login_at` | TIMESTAMPTZ | | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `UNIQUE(auth_provider, auth_subject)`

#### `roles` — 角色定义

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `role_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NULLABLE | NULL = 系统预设角色 |
| `name` | VARCHAR(100) | NOT NULL | 'owner', 'admin', 'member', 'annotator', 'viewer' |
| `permissions` | JSONB | NOT NULL DEFAULT '[]' | 权限列表 |
| `is_system` | BOOLEAN | DEFAULT false | 系统角色不可删除 |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `UNIQUE(org_id, name)` — 允许不同 org 有同名自定义角色

#### `memberships` — 组织成员关系

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `membership_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `user_id` | UUID | FK → users, NOT NULL | |
| `role_id` | UUID | FK → roles, NOT NULL | |
| `status` | VARCHAR(30) | DEFAULT 'active' | active / invited / suspended |
| `invited_by` | UUID | FK → users | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `UNIQUE(org_id, user_id)`

#### `projects` — 项目

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `project_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | |
| `slug` | VARCHAR(100) | NOT NULL | |
| `description` | TEXT | | |
| `region` | VARCHAR(100) | | 地理区域提示 (e.g., 'Southeast Asia') |
| `bbox` | geometry(Polygon, 4326) | | 项目边界 |
| `settings` | JSONB | DEFAULT '{}' | |
| `created_by` | UUID | FK → users | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |
| `archived_at` | TIMESTAMPTZ | | |

**Indexes**: `UNIQUE(org_id, slug)`, `GiST(bbox)`

#### `project_memberships` — 项目级权限（可选，细粒度控制）

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `project_id` | UUID | FK → projects, NOT NULL | |
| `user_id` | UUID | FK → users, NOT NULL | |
| `project_role` | VARCHAR(50) | NOT NULL DEFAULT 'member' | 'admin', 'member', 'annotator', 'viewer' |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**PK**: `(project_id, user_id)`

#### `api_keys` — API 密钥

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `api_key_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `user_id` | UUID | FK → users, NULLABLE | NULL = org-level key |
| `name` | VARCHAR(255) | NOT NULL | 描述性名称 |
| `key_hash` | VARCHAR(255) | NOT NULL | bcrypt/argon2 hash |
| `key_prefix` | VARCHAR(10) | NOT NULL UNIQUE | 前缀用于识别 |
| `scopes` | JSONB | DEFAULT '["*"]' | 权限范围 |
| `expires_at` | TIMESTAMPTZ | | |
| `last_used_at` | TIMESTAMPTZ | | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `revoked_at` | TIMESTAMPTZ | | |

#### `audit_logs` — 审计日志

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `audit_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `user_id` | UUID | FK → users, NULLABLE | NULL = system action |
| `action` | VARCHAR(100) | NOT NULL | e.g., 'project.create', 'inference.submit' |
| `target_type` | VARCHAR(100) | NOT NULL | 资源类型 |
| `target_id` | UUID | | 资源 ID |
| `payload` | JSONB | DEFAULT '{}' | 变更详情（before/after diff） |
| `ip_address` | INET | | |
| `user_agent` | TEXT | | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `btree(org_id, created_at DESC)`, `btree(target_type, target_id)`  
**Lifecycle**: 按月分区（`pg_partman`），保留 12 个月后归档到 S3。

#### `quotas` — 配额/计费追踪

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `period` | DATE | NOT NULL | 计费周期起始日 |
| `metric_key` | VARCHAR(100) | NOT NULL | 'storage_bytes', 'inference_runs', 'api_calls' |
| `used` | BIGINT | DEFAULT 0 | 当期已用 |
| `limit` | BIGINT | | NULL = 无限制 |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

**PK**: `(org_id, period, metric_key)`

---

### Domain 2: Spatial Assets — 空间资产

#### `farms` — 农场/果园/场地

> 命名为 `farms` 以贴合核心场景（棕榈园、果园），但 `farm_type` 支持扩展到其他类型。

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `farm_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `project_id` | UUID | FK → projects, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | |
| `farm_type` | VARCHAR(50) | NOT NULL DEFAULT 'palm_plantation' | 'palm_plantation', 'orchard', 'solar_farm', 'construction', etc. |
| `geom` | geometry(MultiPolygon, 4326) | | 场地边界 |
| `area_ha` | NUMERIC(12,4) | | 面积（公顷），触发器/应用层自动计算 |
| `props` | JSONB | DEFAULT '{}' | 作物类型、种植年份等扩展属性 |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `GiST(geom)`, `btree(project_id)`

#### `blocks` — 地块（场地内子区域）

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `block_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `farm_id` | UUID | FK → farms, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | |
| `geom` | geometry(MultiPolygon, 4326) | NOT NULL | |
| `planting_year` | INTEGER | | 种植年份 |
| `props` | JSONB | DEFAULT '{}' | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `GiST(geom)`, `btree(farm_id)`

#### `rois` — Region of Interest

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `roi_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `project_id` | UUID | FK → projects, NOT NULL | |
| `name` | VARCHAR(255) | | |
| `geom` | geometry(Polygon, 4326) | NOT NULL | |
| `source` | VARCHAR(50) | DEFAULT 'manual' | 'manual', 'from_block', 'from_farm', 'auto' |
| `source_id` | UUID | | 来源实体 ID |
| `props` | JSONB | DEFAULT '{}' | |
| `created_by` | UUID | FK → users | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |
| `deleted_at` | TIMESTAMPTZ | | |

**Indexes**: `GiST(geom)`, `btree(project_id)`

#### `tags` — 标签

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `tag_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `name` | VARCHAR(100) | NOT NULL | |
| `color` | VARCHAR(7) | | hex color |

**Indexes**: `UNIQUE(org_id, name)`

#### `taggings` — 多态标签关联

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `tag_id` | UUID | FK → tags, NOT NULL | |
| `taggable_type` | VARCHAR(50) | NOT NULL | 'project', 'farm', 'roi', 'imagery_asset', etc. |
| `taggable_id` | UUID | NOT NULL | |

**PK**: `(tag_id, taggable_type, taggable_id)`  
**Indexes**: `btree(taggable_type, taggable_id)`

---

### Domain 3: STAC Integration — STAC 集成

#### Integration Strategy — 集成策略

**内部 STAC**: PgSTAC 运行在独立 schema `pgstac`，管理 `pgstac.items`, `pgstac.collections`, `pgstac.searches`。我们不直接修改 PgSTAC 表。

**外部 STAC**: 通过 `stac_remotes` 管理外部 STAC API 连接，`stac_asset_links` 缓存关键字段用于快速查询，并可选链接到 `imagery_assets`。

#### `stac_remotes` — 外部 STAC API 源

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `stac_remote_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `project_id` | UUID | FK → projects, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | 人类可读名称 |
| `stac_api_url` | TEXT | NOT NULL | 外部 STAC API endpoint |
| `auth` | JSONB | DEFAULT '{}' | 认证配置（加密存储，或引用 vault） |
| `default_collection` | VARCHAR(255) | | 默认搜索的 collection |
| `enabled` | BOOLEAN | DEFAULT true | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `btree(project_id)`

#### `stac_asset_links` — STAC Item 链接与缓存索引

> 统一管理内部和外部 STAC 引用。`source` 字段区分来源。关键字段冗余缓存用于快速空间/时间查询。

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `link_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `project_id` | UUID | FK → projects, NOT NULL | |
| `source` | VARCHAR(30) | NOT NULL | 'internal' (PgSTAC) / 'external' |
| `stac_api_url` | TEXT | | 外部 STAC API URL（internal 时为 NULL） |
| `collection_id` | VARCHAR(255) | NOT NULL | STAC collection id |
| `item_id` | VARCHAR(255) | NOT NULL | STAC item id |
| `asset_key` | VARCHAR(100) | | STAC asset key (e.g., 'visual', 'B04') |
| `asset_id` | UUID | FK → imagery_assets, NULLABLE | 链接到统一资产（物化后） |
| `acquired_at` | TIMESTAMPTZ | | 采集时间（冗余缓存） |
| `footprint` | geometry(Polygon, 4326) | | 空间足迹（冗余缓存） |
| `gsd_cm` | INTEGER | | 地面采样距离（厘米） |
| `cloud_cover_pct` | NUMERIC(5,2) | | 云覆盖率 % |
| `bands` | JSONB | | 波段信息 |
| `platform` | VARCHAR(100) | | 卫星/传感器平台 |
| `props` | JSONB | DEFAULT '{}' | 其他缓存属性 |
| `synced_at` | TIMESTAMPTZ | DEFAULT now() | 最后同步时间 |

**Indexes**: `UNIQUE(stac_api_url, collection_id, item_id, asset_key)` （复合唯一，`stac_api_url` 为 NULL 时用 COALESCE）, `GiST(footprint)`, `btree(project_id, acquired_at DESC)`, `btree(gsd_cm)`

---

### Domain 4: GEE Integration — Google Earth Engine 集成

#### `gee_sources` — GEE 数据源定义

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `gee_source_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NULLABLE | NULL = 系统级模板 |
| `project_id` | UUID | FK → projects, NULLABLE | |
| `collection_id` | VARCHAR(255) | NOT NULL | e.g., 'COPERNICUS/S2_SR_HARMONIZED' |
| `name` | VARCHAR(255) | NOT NULL | |
| `query_templates` | JSONB | NOT NULL | 参数化查询模板（filters, compositing, indices） |
| `default_params` | JSONB | DEFAULT '{}' | |
| `description` | TEXT | | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `UNIQUE(project_id, collection_id)` — 每个项目对同一 GEE collection 只有一个源定义

#### `gee_exports` — GEE 导出任务

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `gee_export_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `project_id` | UUID | FK → projects, NOT NULL | |
| `gee_source_id` | UUID | FK → gee_sources, NOT NULL | |
| `roi_id` | UUID | FK → rois | |
| `status` | VARCHAR(30) | NOT NULL DEFAULT 'pending' | pending → submitted → running → completed → failed |
| `gee_task_id` | VARCHAR(255) | | GEE Task ID |
| `time_from` | DATE | NOT NULL | |
| `time_to` | DATE | NOT NULL | |
| `params` | JSONB | NOT NULL | 实际参数（bands, scale, crs, compositing method） |
| `output_asset_id` | UUID | FK → imagery_assets, NULLABLE | 物化后链接到统一资产 |
| `error_message` | TEXT | | |
| `created_by` | UUID | FK → users | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `submitted_at` | TIMESTAMPTZ | | |
| `finished_at` | TIMESTAMPTZ | | |

**Indexes**: `btree(org_id, status)`, `btree(gee_task_id)`, `btree(project_id, created_at DESC)`

---

### Domain 5: Imagery & Data Products — 影像与数据产品（统一资产中心）

#### `imagery_assets` — 统一业务资产注册

> **核心表**。所有影像和数据产品的统一入口，无论来源（直接上传、STAC、GEE 导出、推理输出）。下游只需引用 `asset_id`。

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `asset_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `project_id` | UUID | FK → projects, NOT NULL | |
| `name` | VARCHAR(255) | | 人类可读名称 |
| `asset_type` | VARCHAR(50) | NOT NULL | 'satellite_imagery', 'drone_ortho', 'dem', 'ndvi', 'inference_raster', 'inference_vector', 'basemap' |
| `source_type` | VARCHAR(30) | NOT NULL | 'upload', 'stac', 'gee', 'inference', 'external' |
| `uri` | TEXT | NOT NULL | S3 URI (primary data location) |
| `format` | VARCHAR(30) | | 'cog', 'geoparquet', 'pmtiles', 'geojson', 'csv' |
| `stac_link_id` | UUID | FK → stac_asset_links, NULLABLE | 来自 STAC |
| `gee_export_id` | UUID | FK → gee_exports, NULLABLE | 来自 GEE |
| `acquired_at` | TIMESTAMPTZ | | 数据采集/生成时间 |
| `footprint` | geometry(Polygon, 4326) | | 空间覆盖范围 |
| `gsd_cm` | INTEGER | | 地面分辨率（厘米） |
| `bands` | JSONB | | 波段信息 |
| `crs` | VARCHAR(30) | DEFAULT 'EPSG:4326' | |
| `size_bytes` | BIGINT | | |
| `checksum` | VARCHAR(64) | | SHA-256 |
| `tile_endpoint` | TEXT | | 动态瓦片服务 URL |
| `props` | JSONB | DEFAULT '{}' | 扩展元数据 |
| `created_by` | UUID | FK → users | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |
| `deleted_at` | TIMESTAMPTZ | | |

**Indexes**: `GiST(footprint)`, `btree(project_id, acquired_at DESC)`, `btree(source_type)`, `btree(asset_type)`

---

### Domain 6: Model Registry & Inference Workflow — 模型注册与推理工作流

#### `models` — 模型定义

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `model_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | e.g., 'palm-tree-detector' |
| `slug` | VARCHAR(100) | NOT NULL | |
| `task_type` | VARCHAR(50) | NOT NULL | 'detection', 'segmentation', 'classification', 'regression', 'change_detection' |
| `description` | TEXT | | |
| `created_by` | UUID | FK → users | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |
| `archived_at` | TIMESTAMPTZ | | |

**Indexes**: `UNIQUE(org_id, slug)`

#### `model_versions` — 模型版本

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `model_version_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `model_id` | UUID | FK → models, NOT NULL | |
| `version` | VARCHAR(50) | NOT NULL | semver: '1.2.3' |
| `status` | VARCHAR(30) | DEFAULT 'draft' | draft → staging → production → deprecated |
| `artifact_uri` | TEXT | NOT NULL | S3 URI to model weights |
| `artifact_format` | VARCHAR(30) | | 'pytorch', 'onnx', 'torchscript', 'tensorflow' |
| `artifact_size_bytes` | BIGINT | | |
| `artifact_checksum` | VARCHAR(64) | | SHA-256 |
| `input_spec` | JSONB | NOT NULL | 输入规范：bands, resolution, patch_size |
| `output_spec` | JSONB | NOT NULL | 输出规范：classes, format, geometry_type |
| `metrics` | JSONB | DEFAULT '{}' | mAP, F1, IoU, etc. |
| `provenance` | JSONB | DEFAULT '{}' | git_sha, git_repo, training_snapshot_id, training_config, hyperparams |
| `runtime_config` | JSONB | DEFAULT '{}' | GPU type, batch size, container image |
| `notes` | TEXT | | 版本发布说明 |
| `created_by` | UUID | FK → users | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `promoted_at` | TIMESTAMPTZ | | |

**Indexes**: `UNIQUE(model_id, version)`, `btree(model_id, status)`

> **Design Note**: `provenance` JSONB 包含 `git_sha`, `git_repo`, `training_snapshot_id`, `training_config`。相比独立列，JSONB 更灵活，因为溯源信息结构会随 ML pipeline 演进而变化。`training_snapshot_id` 在应用层验证引用完整性。

#### `inference_jobs` — 推理任务定义

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `job_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `project_id` | UUID | FK → projects, NOT NULL | |
| `model_version_id` | UUID | FK → model_versions, NOT NULL | |
| `asset_id` | UUID | FK → imagery_assets, NULLABLE | 输入影像资产 |
| `roi_id` | UUID | FK → rois, NULLABLE | 推理范围 |
| `name` | VARCHAR(255) | | |
| `status` | VARCHAR(30) | NOT NULL DEFAULT 'pending' | pending → queued → running → succeeded → failed → cancelled |
| `params` | JSONB | DEFAULT '{}' | 推理参数覆盖 |
| `priority` | INTEGER | DEFAULT 0 | |
| `input_snapshot` | JSONB | | 运行时解析的完整输入配置（用于复现） |
| `worker_id` | VARCHAR(100) | | 执行 worker 标识 |
| `progress` | NUMERIC(5,2) | DEFAULT 0 | 0-100 |
| `error` | TEXT | | |
| `created_by` | UUID | FK → users | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `started_at` | TIMESTAMPTZ | | |
| `finished_at` | TIMESTAMPTZ | | |

**Indexes**: `btree(org_id, project_id)`, `btree(model_version_id)`, `btree(status) WHERE status IN ('pending', 'queued', 'running')` (partial index for queue)

> **Simplification Note**: 参考设计将 `inference_jobs` 和 `job_runs` 分离。对于 MVP，我们将它们合并——一个 job = 一次运行。如果未来需要重试/定时重复，可以添加 `job_templates` + `job_runs` 拆分，但当前避免过度设计。

#### `inference_outputs` — 推理输出

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `output_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `job_id` | UUID | FK → inference_jobs, NOT NULL | |
| `output_type` | VARCHAR(30) | NOT NULL | 'vector', 'raster', 'tiles', 'summary', 'report' |
| `format` | VARCHAR(30) | NOT NULL | 'geojson', 'geoparquet', 'cog', 'pmtiles', 'json', 'csv' |
| `uri` | TEXT | NOT NULL | S3 URI |
| `tile_endpoint` | TEXT | | 动态瓦片服务 URL |
| `bbox` | geometry(Polygon, 4326) | | 输出空间范围 |
| `crs` | VARCHAR(30) | DEFAULT 'EPSG:4326' | |
| `stats` | JSONB | DEFAULT '{}' | 汇总统计（feature count, area, class distribution） |
| `manifest` | JSONB | DEFAULT '{}' | 完整输出清单（see JSON Schema F1） |
| `size_bytes` | BIGINT | | |
| `asset_id` | UUID | FK → imagery_assets, NULLABLE | 注册为统一资产后的链接 |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `btree(job_id)`, `GiST(bbox)`, `btree(org_id, output_type)`

#### `inference_result_index` — 轻量级结果索引

> 扁平化索引，支持按 project/time/ROI/label/model 快速查询，避免多表 JOIN。

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `idx_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `project_id` | UUID | FK → projects, NOT NULL | |
| `output_id` | UUID | FK → inference_outputs, NOT NULL | |
| `model_version_id` | UUID | FK → model_versions | |
| `task_type` | VARCHAR(50) | | 冗余，快速过滤 |
| `label_key` | VARCHAR(100) | | 主分类标签 |
| `time_key` | TIMESTAMPTZ | | 对应的时间 |
| `geom` | geometry(Polygon, 4326) | | 空间范围 |
| `roi_id` | UUID | FK → rois | |
| `feature_count` | INTEGER | | |
| `confidence_mean` | NUMERIC(5,4) | | |
| `props` | JSONB | DEFAULT '{}' | |

**Indexes**: `GiST(geom)`, `btree(project_id, time_key DESC)`, `btree(label_key)`, `btree(model_version_id)`, `btree(roi_id)`

---

### Domain 7: Annotation & Review Versioning — 标注与审核版本化

#### `annotation_tasks` — 标注任务

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `task_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `project_id` | UUID | FK → projects, NOT NULL | |
| `asset_id` | UUID | FK → imagery_assets, NULLABLE | 标注的基础影像 |
| `roi_id` | UUID | FK → rois, NULLABLE | 标注范围 |
| `seed_output_id` | UUID | FK → inference_outputs, NULLABLE | 从推理结果预填充 |
| `name` | VARCHAR(255) | NOT NULL | |
| `description` | TEXT | | |
| `task_type` | VARCHAR(50) | NOT NULL | 'detection', 'segmentation', 'classification', 'qa_review' |
| `label_schema` | JSONB | NOT NULL | 类别定义、属性字段 |
| `status` | VARCHAR(30) | DEFAULT 'open' | open → in_progress → review → completed |
| `assigned_to` | UUID[] | | 分配的标注员 |
| `due_date` | DATE | | |
| `created_by` | UUID | FK → users | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `btree(org_id, project_id)`, `btree(status)`

#### `annotation_sets` — 标注集

> 一个 task 可有多个 sets（如不同标注员的结果）。通过 commit chain 版本化。

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `ann_set_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `task_id` | UUID | FK → annotation_tasks, NOT NULL | |
| `name` | VARCHAR(255) | DEFAULT 'default' | |
| `head_commit_id` | UUID | FK → annotation_commits, NULLABLE (DEFERRABLE) | 当前最新 commit |
| `feature_count` | INTEGER | DEFAULT 0 | 当前活跃特征数（缓存） |
| `created_by` | UUID | FK → users | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `btree(task_id)`

#### `annotation_commits` — 标注提交（Append-Only）

> Git-like commit chain。审核状态内嵌到 commit 上（参考设计的简化模式），减少 JOIN。

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `commit_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `ann_set_id` | UUID | FK → annotation_sets, NOT NULL | |
| `parent_commit_id` | UUID | FK → annotation_commits, NULLABLE | NULL = 初始 commit |
| `message` | TEXT | | 提交说明 |
| `author_id` | UUID | FK → users, NOT NULL | |
| `stats` | JSONB | DEFAULT '{}' | {added: N, modified: N, deleted: N} |
| `metadata` | JSONB | DEFAULT '{}' | 扩展元数据 (see JSON Schema F3) |
| `review_status` | VARCHAR(30) | | NULL / 'pending' / 'approved' / 'rejected' / 'changes_requested' |
| `reviewed_by` | UUID | FK → users, NULLABLE | |
| `reviewed_at` | TIMESTAMPTZ | | |
| `review_comment` | TEXT | | 审核评论 |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `btree(ann_set_id, created_at DESC)`, `btree(parent_commit_id)`

> **Design Decision**: 审核状态放在 commit 上而非独立 `reviews` 表。理由：一个 commit 在同一 set 中只需一次审核决策，1:1 关系不需要独立表。如果未来需要多人审核流程，可以添加 `review_votes` 表。

#### `annotation_features` — 标注特征（Append-Only with Tombstones）

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `feature_id` | UUID | PK | 每行的 row ID |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `commit_id` | UUID | FK → annotation_commits, NOT NULL | |
| `object_id` | UUID | NOT NULL | 逻辑对象 ID（跨 commit 稳定） |
| `geom` | geometry(Geometry, 4326) | | delete 时为 NULL |
| `label_key` | VARCHAR(100) | | 分类标签键 |
| `label_value` | VARCHAR(255) | | 分类标签值 |
| `properties` | JSONB | DEFAULT '{}' | 扩展属性 |
| `confidence` | NUMERIC(5,4) | | |
| `is_deleted` | BOOLEAN | DEFAULT false | tombstone 标记 |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `GiST(geom)`, `btree(commit_id)`, `btree(object_id, created_at DESC)`

> **`is_deleted` vs `operation` enum**: 参考设计用 `is_deleted` boolean，比 operation enum 更简单——每行要么是某个对象的最新状态，要么是删除标记。INSERT-only + `object_id` 去重即可重建当前视图。

**Current View Materialization Strategy — 当前视图物化策略**:

```sql
-- Materialized View (推荐 MVP)
CREATE MATERIALIZED VIEW annotation_features_current AS
SELECT DISTINCT ON (af.object_id)
    af.object_id,
    af.geom,
    af.label_key,
    af.label_value,
    af.properties,
    af.confidence,
    af.commit_id,
    af.org_id,
    af.created_at,
    aset.ann_set_id,
    aset.task_id
FROM annotation_features af
JOIN annotation_commits ac ON af.commit_id = ac.commit_id
JOIN annotation_sets aset ON ac.ann_set_id = aset.ann_set_id
WHERE af.is_deleted = false
ORDER BY af.object_id, af.created_at DESC;

-- 在 commit 创建后 REFRESH CONCURRENTLY
-- 对于 <100k features 的集，刷新 <1s
-- Phase 2: Redis 缓存用于高频编辑场景
```

#### `training_snapshots` — 训练数据快照

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `snapshot_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `project_id` | UUID | FK → projects, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | |
| `description` | TEXT | | |
| `ann_set_id` | UUID | FK → annotation_sets, NOT NULL | 来源标注集 |
| `commit_id` | UUID | FK → annotation_commits, NOT NULL | 锁定到特定 commit（不可变快照点） |
| `format` | VARCHAR(30) | NOT NULL | 'coco', 'geojson', 'geoparquet', 'yolo' |
| `uri` | TEXT | NOT NULL | S3 URI |
| `stats` | JSONB | DEFAULT '{}' | 类别分布、样本数量、train/val/test 拆分 |
| `size_bytes` | BIGINT | | |
| `checksum` | VARCHAR(64) | | SHA-256 |
| `created_by` | UUID | FK → users | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `btree(org_id, created_at DESC)`, `btree(ann_set_id)`

---

### Domain 8: Kepler Map Config Versioning — 地图配置版本化

#### `map_configs` — 地图配置（Append-Only Parent Chain）

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `map_config_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `project_id` | UUID | FK → projects, NOT NULL | |
| `parent_id` | UUID | FK → map_configs, NULLABLE | 父版本 |
| `version` | INTEGER | NOT NULL | 递增版本号 |
| `title` | VARCHAR(255) | NOT NULL | |
| `description` | TEXT | | |
| `kepler_config` | JSONB | NOT NULL | Kepler.gl 完整 config JSON |
| `dataset_refs` | JSONB | NOT NULL DEFAULT '[]' | 数据集引用数组 (see JSON Schema F2) |
| `tags` | TEXT[] | | 标签数组 |
| `created_by` | UUID | FK → users | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `UNIQUE(project_id, version)`, `btree(project_id, created_at DESC)`, `btree(parent_id)`

> **Design Decision**: `dataset_refs` 作为 JSONB 数组内嵌到 `map_configs` 而非独立表。理由：
> 1. dataset_refs 与 config 强绑定，一起版本化
> 2. Kepler config 恢复时需要原子加载（config + refs 一起）
> 3. JSONB 支持 `@>` 操作符查询特定引用
> 4. 避免 config 版本化时需要同时复制关联表行
>
> 如果 refs 数量极大（>50），可以考虑拆分为独立表。

#### `map_config_releases` — 发布版本

> 独立于 config 的发布记录，支持多通道发布（production, staging, etc.）。Release 引用的 config 不可修改。

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `release_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `map_config_id` | UUID | FK → map_configs, NOT NULL | |
| `channel` | VARCHAR(50) | NOT NULL DEFAULT 'production' | 'production', 'staging', 'preview' |
| `released_by` | UUID | FK → users, NOT NULL | |
| `released_at` | TIMESTAMPTZ | DEFAULT now() | |
| `notes` | TEXT | | 发布说明 |

**Indexes**: `btree(map_config_id)`, `UNIQUE(project_id, channel)` — 每个项目每个通道只有一个活跃 release（通过应用层 + partial index 实现）

#### `map_config_shares` — 分享配置

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `share_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `map_config_id` | UUID | FK → map_configs, NOT NULL | |
| `visibility` | VARCHAR(30) | NOT NULL | 'private', 'org', 'public' |
| `token` | VARCHAR(64) | UNIQUE | 公开分享令牌 |
| `permissions` | JSONB | DEFAULT '{"view": true}' | 'view', 'edit', 'comment' |
| `expires_at` | TIMESTAMPTZ | | |
| `created_by` | UUID | FK → users | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `btree(map_config_id)`, `btree(token) WHERE token IS NOT NULL`

---

### Domain 9: Robot / IoT Extension — 机器人/IoT 扩展

#### `device_types` — 设备类型

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `device_type_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NULLABLE | NULL = 系统预设 |
| `name` | VARCHAR(100) | NOT NULL | 'drone_dji_m30t', 'ground_robot_v2', 'weather_station' |
| `category` | VARCHAR(30) | NOT NULL | 'uav', 'ugv', 'usv', 'fixed_sensor', 'handheld' |
| `capabilities` | JSONB | DEFAULT '{}' | 传感器、载荷能力 |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

#### `devices` — 设备实例

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `device_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `device_type_id` | UUID | FK → device_types, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | |
| `serial` | VARCHAR(100) | | 序列号 |
| `status` | VARCHAR(30) | DEFAULT 'idle' | idle, active, maintenance, retired |
| `last_seen_at` | TIMESTAMPTZ | | |
| `props` | JSONB | DEFAULT '{}' | 固件版本等 |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `retired_at` | TIMESTAMPTZ | | |

**Indexes**: `btree(org_id, status)`

#### `missions` — 任务/航线

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `mission_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `project_id` | UUID | FK → projects, NULLABLE | |
| `device_id` | UUID | FK → devices, NOT NULL | |
| `name` | VARCHAR(255) | | |
| `mission_type` | VARCHAR(50) | | 'survey', 'inspection', 'monitoring' |
| `status` | VARCHAR(30) | DEFAULT 'planned' | planned → in_progress → completed → aborted |
| `roi_id` | UUID | FK → rois, NULLABLE | |
| `started_at` | TIMESTAMPTZ | | |
| `finished_at` | TIMESTAMPTZ | | |
| `props` | JSONB | DEFAULT '{}' | 飞行高度、速度等 |
| `created_by` | UUID | FK → users | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `btree(org_id, project_id)`, `btree(device_id)`

#### `mission_tracks` — 任务轨迹

> 独立表而非内嵌到 missions，因为一个 mission 可能产生多段轨迹（分段飞行、信号中断等）。

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `track_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `mission_id` | UUID | FK → missions, NOT NULL | |
| `geom` | geometry(LineString, 4326) | NOT NULL | 轨迹线 |
| `time_from` | TIMESTAMPTZ | NOT NULL | 段起始时间 |
| `time_to` | TIMESTAMPTZ | NOT NULL | 段结束时间 |
| `stats` | JSONB | DEFAULT '{}' | 距离、最大高度、平均速度等 |

**Indexes**: `GiST(geom)`, `btree(mission_id)`

#### `mission_events` — 任务事件

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `event_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `mission_id` | UUID | FK → missions, NOT NULL | |
| `event_type` | VARCHAR(50) | NOT NULL | 'takeoff', 'landing', 'waypoint', 'photo', 'anomaly', 'battery_low' |
| `geom` | geometry(Point, 4326) | | |
| `occurred_at` | TIMESTAMPTZ | NOT NULL | |
| `payload` | JSONB | DEFAULT '{}' | 事件相关数据 |

**Indexes**: `GiST(geom)`, `btree(mission_id, occurred_at)`, `btree(event_type)`

#### `telemetry_refs` — 遥测数据引用

> **核心设计决策**：高频遥测数据存在对象存储（Parquet/CSV），DB 只存引用和时间范围索引。避免在 PostgreSQL 中存储海量时序数据。

| Column | Type | Constraints | 说明 |
|--------|------|------------|------|
| `telemetry_ref_id` | UUID | PK | |
| `org_id` | UUID | FK → orgs, NOT NULL | |
| `device_id` | UUID | FK → devices, NOT NULL | |
| `mission_id` | UUID | FK → missions, NULLABLE | |
| `storage_type` | VARCHAR(30) | NOT NULL | 'parquet', 'csv', 'timescaledb' |
| `uri` | TEXT | NOT NULL | S3 URI or TimescaleDB table reference |
| `schema` | JSONB | | 列名、类型描述 |
| `time_from` | TIMESTAMPTZ | NOT NULL | |
| `time_to` | TIMESTAMPTZ | NOT NULL | |
| `row_count` | BIGINT | | |
| `size_bytes` | BIGINT | | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

**Indexes**: `btree(device_id, time_from)`, `btree(mission_id)`

> **vs. 内联遥测表**: 参考设计使用 `telemetry_refs` 指向外部存储，而非在 PostgreSQL 中存储原始遥测。这是正确的架构决策：
> - 无人机每秒 10-50 条遥测记录，一次 2 小时飞行 = 36K-360K 行
> - PostgreSQL 不适合作为时序数据库（缺乏高效压缩、降采样、连续聚合）
> - 如果确实需要 DB 内查询，Phase 3 可以引入 TimescaleDB 超表
> - S3 Parquet + DuckDB 查询 = 低成本高性能方案

---

## D) Design Rationale

### D1. Metadata DB vs Heavy Data Object Store — 元数据 DB vs 重数据对象存储

**决策**: PostgreSQL 存元数据/关系/权限/轻量级几何；S3/MinIO 存栅格/大矢量/模型权重/遥测归档。

**原因**:
- S3 成本 ~$0.023/GB/月 vs EBS ~$0.10/GB/月，TB 级影像差距巨大
- S3 天然支持 CDN 分发、HTTP Range 读取（COG/PMTiles 按需读取）
- PostgreSQL 提供 ACID 事务 + RLS，保证元数据一致性和安全
- `imagery_assets.uri` 作为指针，连接 DB 元数据和 S3 重数据
- 遥测数据通过 `telemetry_refs` 指向 S3 Parquet，避免 PostgreSQL 时序膨胀

### D2. Append-Only Versioning + Parent Chain — 追加式版本化

**决策**: `annotation_features` 和 `map_configs` 使用 append-only 设计。

**标注版本化**:
- 每个 `annotation_commit` 只包含该次变更的 features（INSERT-only）
- `object_id` 跨 commit 稳定，`is_deleted = true` 作为 tombstone
- 任何历史版本可通过 replay commit chain 精确重建
- `training_snapshots` 通过 `commit_id` 锁定不可变快照点 → 训练可复现性

**Map config 版本化**:
- `parent_id` 构成 chain，`version` 递增
- `map_config_releases` 独立记录发布事件，一个 config 可发布到多个 channel
- Release 引用的 config 不可修改（应用层/触发器保证）

**Trade-off**: 当前视图需要 `DISTINCT ON + ORDER BY` 或 materialized view，但标注场景写远少于读，可接受。

### D3. STAC/GEE: Virtual vs Materialized — 虚拟 vs 物化

**STAC**:
- PgSTAC 管理内部 STAC catalog（`pgstac` schema），我们不侵入
- `stac_remotes` 管理外部 STAC API 连接（远端不可靠，需要缓存）
- `stac_asset_links` 缓存关键字段（time, footprint, gsd）到本地，避免每次 API 调用
- STAC item 物化后链接到 `imagery_assets`（`stac_link_id`）

**GEE**:
- GEE 是计算平台不是文件仓库——数据是 "虚拟" 的，直到 export
- `gee_sources` 定义可复现的查询模板（collection + filters + compositing）
- `gee_exports` 跟踪 export → S3 的物化过程
- 完成后创建 `imagery_assets` 记录（`source_type = 'gee'`）
- `params` JSONB 记录完整参数，保证可复现性

### D4. Supporting Kepler Consumption — 适配 Kepler

**`imagery_assets` 统一入口**:
- Kepler 的 dataset 都通过 `asset_id` 引用，无需关心数据来源
- `tile_endpoint` 提供 TiTiler/Martin URL，Kepler 直接消费

**`map_configs` 原样保存**:
- `kepler_config` JSONB 存储完整 Kepler config，恢复时直接加载
- 不做 schema 归一化——Kepler config 格式由 Kepler 控制

**`dataset_refs` 可验证**:
- 内嵌 JSONB 数组，每个 ref 指定 `source_type` + 来源细节
- 应用层加载时验证引用有效性（asset 存在？tile endpoint 可达？）
- 支持 internal / stac / gee / pmtiles / external_url 五种来源

**恢复流程**: `GET /api/map-configs/{id}` → 返回 `kepler_config` + `dataset_refs` → 前端逐一加载数据集 → 应用 config

### D5. Multi-Tenant Isolation — 多租户隔离策略

**决策**: `org_id` FK 渗透所有业务表 + PostgreSQL RLS

**实现**:
```sql
-- 每张业务表启用 RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON projects
    USING (org_id = current_setting('app.current_org', true)::uuid);

-- FastAPI middleware 在每个请求开始时
-- SET LOCAL app.current_org = '<org-uuid>';
```

**隔离层次**:
1. **org_id FK** — 应用层过滤（第一道防线）
2. **RLS** — 数据库层强制隔离（即使应用层有 bug 也不泄露）
3. **project_memberships** — 项目级细粒度控制（可选）
4. **map_config_shares.token** — 临时访问令牌（跨租户分享）

**PgSTAC 隔离**: PgSTAC 表不在我们的 RLS 范围内。通过 `stac_asset_links.org_id` 和应用层 STAC API wrapper 实现间接隔离。

### D6. Indexing Strategy — 索引策略

| 索引类型 | 用途 | 目标列 |
|---------|------|--------|
| **GiST** | 空间查询 (intersects, contains, within) | 所有 `geom` / `footprint` / `bbox` 列 |
| **B-tree** | 等值/范围查询 | `org_id`, `status`, `created_at`, all FKs |
| **B-tree composite** | 覆盖常见查询 | `(project_id, acquired_at DESC)`, `(org_id, project_id)` |
| **Partial index** | 热数据快速访问 | `WHERE status IN ('pending', 'queued', 'running')` |
| **UNIQUE** | 业务约束 | `(org_id, slug)`, `(model_id, version)`, `(project_id, version)` |

**原则**:
- 每个 FK 列都建 btree（避免级联删除时全表扫描）
- 时间列用 `DESC` 排序（最新数据最常查询）
- audit_logs 按月分区，分区键作为隐式索引

### D7. Naming & Extensibility — 命名与可扩展性

- **PK 命名**: `{entity}_id` (e.g., `org_id`, `asset_id`) — 在 JOIN 中自描述
- **JSONB 扩展点**: `props` / `params` / `metadata` — 避免频繁 ALTER TABLE
- **Status 用 VARCHAR**: 不用 ENUM（`ALTER TYPE ADD VALUE` 不可回滚），应用层 CHECK
- **表名复数**: `projects`, `models`, `devices`
- **Soft delete**: 仅 `orgs`, `rois`, `imagery_assets` 使用 `deleted_at`（数据生命周期关键表）

---

## E) MVP Subset & Phase 2 Expansion

### MVP (Phase 1) — 最小可用表集

> 目标：支持 "上传/获取影像 → ROI 选择 → 推理 → 结果查看 → 基础地图配置" 核心流程

| Domain | Tables | Count |
|--------|--------|-------|
| **1. Tenancy** | `orgs`, `users`, `memberships`, `projects`, `api_keys`, `audit_logs` | 6 |
| **2. Spatial** | `farms`, `blocks`, `rois` | 3 |
| **3. STAC** | `stac_remotes`, `stac_asset_links` | 2 |
| **5. Assets** | `imagery_assets` | 1 |
| **6. Model+Inference** | `models`, `model_versions`, `inference_jobs`, `inference_outputs`, `inference_result_index` | 5 |
| **8. Kepler** | `map_configs`, `map_config_releases`, `map_config_shares` | 3 |
| **MVP Total** | | **20** |

### Phase 2 — 扩展

| Domain | Tables | Count |
|--------|--------|-------|
| **1. Tenancy** | `roles`, `project_memberships`, `quotas` | 3 |
| **2. Spatial** | `tags`, `taggings` | 2 |
| **4. GEE** | `gee_sources`, `gee_exports` | 2 |
| **7. Annotation** | `annotation_tasks`, `annotation_sets`, `annotation_commits`, `annotation_features`, `training_snapshots` | 5 |
| **Materialized Views** | `annotation_features_current`, `inference_result_stats` | 2 MVs |
| **Phase 2 Total** | | **+12 tables, +2 MVs** |

**Phase 2 Materialized Views 说明**:
- **`annotation_features_current`** — 标注当前视图，从 append-only commit chain 计算每个 `object_id` 的最新状态。消除 `DISTINCT ON` 查询开销。在 commit 写入后 `REFRESH CONCURRENTLY`。
- **`inference_result_stats`** — 推理结果聚合统计（按 project/model/label 分组），驱动仪表板和项目概览。在推理任务完成后刷新，或通过 `pg_cron` 定时刷新。

### Phase 3 — 高级功能

| Domain | Tables | Count |
|--------|--------|-------|
| **9. Robot/IoT** | `device_types`, `devices`, `missions`, `mission_tracks`, `mission_events`, `telemetry_refs` | 6 |
| **Extras** | TimescaleDB hypertables, federated STAC, real-time collab | TBD |
| **Phase 3 Total** | | **+6** |

**Grand Total**: ~38 tables across all phases

---

## H) Implementation Order — 落地次序（Kepler-first 最短路径）

> 以 Kepler 工作区为锚点，逐步向上游（数据获取）和下游（标注/训练）扩展。每个阶段交付可用的端到端切片。

### Step 1: Kepler Workspace — 先做稳工作区

**Tables**: `orgs`, `users`, `memberships`, `projects`, `api_keys`, `audit_logs` + `imagery_assets` + `map_configs`, `map_config_releases`, `map_config_shares`

**目标**: 用户可以上传/注册影像资产，创建地图配置，保存/恢复/版本化/分享。Kepler UI 可靠工作。

**验收标准**:
- 上传 COG → 创建 `imagery_assets` 记录 → TiTiler 动态切片 → Kepler 加载显示
- 保存 Kepler config → 恢复完整状态（图层、样式、视角）
- `dataset_refs` 正确解析 internal 类型
- 版本链和分享链接工作

### Step 2: Inference Pipeline — 接推理

**Tables**: `farms`, `blocks`, `rois` + `models`, `model_versions` + `inference_jobs`, `inference_outputs`, `inference_result_index`

**目标**: 在 ROI 上提交推理任务，输出注册为 `imagery_assets`，自动出现在 Kepler 可选数据集中。

**验收标准**:
- 划定 ROI → 选择模型 → 提交推理 → 查看进度
- 推理完成 → vector/raster 输出写入 S3 → 注册 `imagery_assets` + `inference_outputs`
- Martin/TiTiler 提供 tile endpoint → Kepler 加载推理结果
- `inference_result_index` 支持按 project/time/label 筛选

### Step 3: STAC Integration — 接入 STAC

**Tables**: `stac_remotes`, `stac_asset_links`  
**Infra**: PgSTAC 部署 + stac-fastapi

**目标**: 浏览外部卫星影像目录，选择并缓存到本地，链接到 `imagery_assets` 作为推理输入。

**验收标准**:
- 配置外部 STAC API → 搜索 Sentinel-2 影像 → 缓存关键字段
- STAC item 物化为 `imagery_assets` → 可作为推理输入
- `dataset_refs` 支持 `stac` 类型 → Kepler 直接消费 STAC 瓦片
- 内部推理输出也注册到 PgSTAC → 形成统一目录

### Step 4: GEE Integration — 虚拟数据物化

**Tables**: `gee_sources`, `gee_exports`

**目标**: 定义 GEE 查询模板，按 ROI + 时间范围导出到 S3，物化为 `imagery_assets`。

**验收标准**:
- 配置 GEE source (e.g., S2 NDVI composite) → 选择 ROI + 时间 → 提交导出
- GEE task 完成 → COG 写入 S3 → 创建 `imagery_assets`
- `dataset_refs` 支持 `gee` 类型 → 完整溯源链
- 参数化模板保证可复现性

### Step 5: Annotation & Training Loop — 标注闭环

**Tables**: `annotation_tasks`, `annotation_sets`, `annotation_commits`, `annotation_features`, `training_snapshots`  
**Materialized Views**: `annotation_features_current`, `inference_result_stats`

**目标**: 从推理结果创建标注任务，审核标注，导出训练快照，反馈到模型训练。

**验收标准**:
- 推理结果 → 创建标注任务（seed from inference output）
- 标注编辑 → append-only commits → 版本历史可回溯
- 审核流程 → approve/reject/changes_requested
- 导出 training snapshot (COCO/GeoParquet) → 锁定到 commit → 不可变
- `model_versions.provenance.training_snapshot_id` 完成溯源闭环

### Step 6 (Future): Robot/IoT

**Tables**: Domain 9 全套

**前提**: 有实际设备接入需求时再实施。

```
Timeline visualization:

Step 1 ████████░░░░░░░░░░░░░░░░░░░░  Kepler Workspace
Step 2 ░░░░░░░░████████░░░░░░░░░░░░  Inference Pipeline
Step 3 ░░░░░░░░░░░░░░░░████░░░░░░░░  STAC Integration
Step 4 ░░░░░░░░░░░░░░░░░░░░████░░░░  GEE Integration
Step 5 ░░░░░░░░░░░░░░░░░░░░░░░░████  Annotation Loop
Step 6 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Robot/IoT (future)
```

---

## F) JSON Schemas

> 三份正式 JSON Schema（draft 2020-12），定义 JSONB 列的结构约束。后附各 schema 的示例文档。

### F1. Inference Output Manifest — 推理输出清单

> 存储在 `inference_outputs.manifest` JSONB 列。

#### JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "InferenceOutputManifest",
  "type": "object",
  "required": ["job_id", "project_id", "model_version_id", "asset_id", "roi_id", "outputs", "summary"],
  "properties": {
    "job_id": { "type": "string", "format": "uuid" },
    "project_id": { "type": "string", "format": "uuid" },
    "model_version_id": { "type": "string", "format": "uuid" },
    "asset_id": { "type": "string", "format": "uuid" },
    "roi_id": { "type": "string", "format": "uuid" },
    "summary": {
      "type": "object",
      "properties": {
        "task_type": { "type": "string" },
        "label_key": { "type": "string" },
        "count": { "type": "number" },
        "class_hist": { "type": "object", "additionalProperties": { "type": "number" } },
        "score_hist": { "type": "object", "additionalProperties": { "type": "number" } },
        "area_ha": { "type": "number" },
        "density_per_ha": { "type": "number" }
      }
    },
    "outputs": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["output_type", "format", "uri"],
        "properties": {
          "output_type": { "enum": ["vector", "raster", "tiles", "summary"] },
          "format": { "enum": ["geojson", "geoparquet", "cog", "pmtiles", "mvt", "json", "csv"] },
          "uri": { "type": "string", "format": "uri" },
          "bbox": { "type": "array", "items": { "type": "number" }, "minItems": 4, "maxItems": 4 },
          "crs": { "type": "string", "default": "EPSG:4326" },
          "size_bytes": { "type": "integer" },
          "checksum_sha256": { "type": "string" },
          "tile_endpoint": { "type": "string", "format": "uri-template" },
          "geometry_type": { "type": "string" },
          "feature_count": { "type": "integer" },
          "resolution_m": { "type": "number" },
          "bands": { "type": "array", "items": { "type": "string" } },
          "min_zoom": { "type": "integer" },
          "max_zoom": { "type": "integer" },
          "stats": { "type": "object" }
        }
      }
    },
    "model": {
      "type": "object",
      "properties": {
        "model_id": { "type": "string" },
        "model_version_id": { "type": "string" },
        "version": { "type": "string" },
        "task_type": { "type": "string" }
      }
    },
    "input": {
      "type": "object",
      "properties": {
        "asset_id": { "type": "string" },
        "stac_items": { "type": "array", "items": { "type": "string" } },
        "time_range": { "type": "array", "items": { "type": "string", "format": "date" }, "minItems": 2, "maxItems": 2 },
        "roi_id": { "type": "string" },
        "roi_area_ha": { "type": "number" }
      }
    }
  }
}
```

#### Example Document

```json
{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "project_id": "p1234567-89ab-cdef-0123-456789abcdef",
  "model_version_id": "mv123456-78ab-cdef-0123-456789abcdef",
  "asset_id": "as123456-78ab-cdef-0123-456789abcdef",
  "roi_id": "ro123456-78ab-cdef-0123-456789abcdef",
  "summary": {
    "task_type": "detection",
    "label_key": "tree_status",
    "count": 45230,
    "class_hist": { "healthy": 41500, "stressed": 2800, "dead": 930 },
    "score_hist": { "0.5-0.6": 120, "0.6-0.7": 850, "0.7-0.8": 5200, "0.8-0.9": 18060, "0.9-1.0": 21000 },
    "area_ha": 1250.5,
    "density_per_ha": 36.2
  },
  "outputs": [
    {
      "output_type": "vector",
      "format": "geoparquet",
      "uri": "s3://palmview-outputs/org-abc/jobs/job-123/detections.parquet",
      "bbox": [101.5, 2.8, 102.1, 3.2],
      "crs": "EPSG:4326",
      "geometry_type": "Point",
      "feature_count": 45230,
      "size_bytes": 12453000,
      "checksum_sha256": "a1b2c3d4e5f6..."
    },
    {
      "output_type": "raster",
      "format": "cog",
      "uri": "s3://palmview-outputs/org-abc/jobs/job-123/density.tif",
      "bbox": [101.5, 2.8, 102.1, 3.2],
      "crs": "EPSG:4326",
      "resolution_m": 1.0,
      "bands": ["density"],
      "size_bytes": 8900000,
      "tile_endpoint": "https://tiles.palmview.ai/cog/tiles/{z}/{x}/{y}?url=s3://..."
    },
    {
      "output_type": "tiles",
      "format": "pmtiles",
      "uri": "s3://palmview-outputs/org-abc/jobs/job-123/detections.pmtiles",
      "min_zoom": 8,
      "max_zoom": 16,
      "tile_endpoint": "pmtiles://s3://palmview-outputs/org-abc/jobs/job-123/detections.pmtiles"
    }
  ],
  "model": {
    "model_id": "md123456-...",
    "model_version_id": "mv123456-...",
    "version": "2.1.0",
    "task_type": "detection"
  },
  "input": {
    "asset_id": "as123456-...",
    "stac_items": ["sentinel-2-l2a/S2A_MSIL2A_20260115T..."],
    "time_range": ["2026-01-01", "2026-01-31"],
    "roi_id": "ro123456-...",
    "roi_area_ha": 1250.5
  }
}
```

### F2. Kepler Dataset Refs — 数据集引用结构

> 存储在 `map_configs.dataset_refs` JSONB 列。每个 ref 通过 `ref_type` 区分来源，对应的配置放在 `internal` / `stac` / `gee` 子对象中。

#### JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "KeplerDatasetRefs",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["ref_type", "name"],
    "properties": {
      "name": { "type": "string", "description": "Human-readable dataset label" },
      "ref_type": { "enum": ["internal", "stac", "gee"] },
      "asset_id": { "type": "string", "format": "uuid", "description": "Link to imagery_assets" },
      "output_id": { "type": "string", "format": "uuid", "description": "Link to inference_outputs" },
      "time_key": { "type": "string", "format": "date-time" },
      "layer_order": { "type": "integer", "default": 0 },
      "visible": { "type": "boolean", "default": true },
      "style_hints": { "type": "object" },
      "internal": {
        "type": "object",
        "properties": {
          "uri": { "type": "string", "format": "uri" },
          "format": { "enum": ["geojson", "mvt", "pmtiles", "wmts", "xyz", "cog", "geoparquet"] },
          "tile_endpoint": { "type": "string", "format": "uri-template" }
        }
      },
      "stac": {
        "type": "object",
        "properties": {
          "stac_api": { "type": "string", "format": "uri" },
          "collection_id": { "type": "string" },
          "item_id": { "type": "string" },
          "asset_key": { "type": "string" },
          "cached_link_id": { "type": "string", "format": "uuid", "description": "FK to stac_asset_links" },
          "bands": { "type": "array", "items": { "type": "string" } },
          "rescale": { "type": "string" }
        }
      },
      "gee": {
        "type": "object",
        "properties": {
          "collection_id": { "type": "string" },
          "gee_source_id": { "type": "string", "format": "uuid" },
          "gee_export_id": { "type": "string", "format": "uuid" },
          "query_template": { "type": "object" },
          "materialized_uri": { "type": "string", "format": "uri" }
        }
      }
    }
  }
}
```

#### Example Document

```json
[
  {
    "name": "Palm Tree Detections (Jan 2026)",
    "ref_type": "internal",
    "asset_id": "as123456-78ab-cdef-0123-456789abcdef",
    "output_id": "ou123456-78ab-cdef-0123-456789abcdef",
    "time_key": "2026-01-15T00:00:00Z",
    "layer_order": 0,
    "visible": true,
    "internal": {
      "uri": "s3://palmview-outputs/org-abc/jobs/job-123/detections.parquet",
      "format": "geoparquet",
      "tile_endpoint": "https://tiles.palmview.ai/martin/detections/{z}/{x}/{y}"
    },
    "style_hints": {
      "color_field": "label_value",
      "color_map": { "healthy": "#2ecc71", "stressed": "#f39c12", "dead": "#e74c3c" }
    }
  },
  {
    "name": "Sentinel-2 RGB (Jan 15)",
    "ref_type": "stac",
    "time_key": "2026-01-15T03:20:00Z",
    "layer_order": 1,
    "visible": true,
    "stac": {
      "stac_api": "https://stac.palmview.ai",
      "collection_id": "sentinel-2-l2a",
      "item_id": "S2A_MSIL2A_20260115T032001_N0509_R018_T47NQA_20260115T062345",
      "asset_key": "visual",
      "cached_link_id": "sl123456-...",
      "bands": ["B04", "B03", "B02"],
      "rescale": "0,3000"
    }
  },
  {
    "name": "NDVI Composite Jan 2026",
    "ref_type": "gee",
    "asset_id": "as789012-...",
    "layer_order": 2,
    "visible": false,
    "gee": {
      "collection_id": "COPERNICUS/S2_SR_HARMONIZED",
      "gee_source_id": "gs123456-...",
      "gee_export_id": "ge123456-...",
      "materialized_uri": "s3://palmview-gee/org-abc/exports/ndvi-2026-01.tif"
    }
  }
]
```

### F3. Annotation Commit Metadata — 标注提交元数据

> 存储在 `annotation_commits.metadata` JSONB 列。同时也描述了 commit 的完整 API 响应结构。

#### JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "AnnotationCommitMeta",
  "type": "object",
  "required": ["ann_set_id", "commit_id", "parent_commit_id", "author_id", "created_at", "message"],
  "properties": {
    "ann_set_id": { "type": "string", "format": "uuid" },
    "commit_id": { "type": "string", "format": "uuid" },
    "parent_commit_id": { "type": ["string", "null"], "format": "uuid" },
    "author_id": { "type": "string", "format": "uuid" },
    "created_at": { "type": "string", "format": "date-time" },
    "message": { "type": "string" },
    "review_status": { "enum": ["pending", "approved", "rejected", "changes_requested", null] },
    "reviewed_by": { "type": ["string", "null"], "format": "uuid" },
    "reviewed_at": { "type": ["string", "null"], "format": "date-time" },
    "diff_summary": {
      "type": "object",
      "properties": {
        "added": { "type": "number" },
        "changed": { "type": "number" },
        "deleted": { "type": "number" },
        "by_label": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "properties": {
              "added": { "type": "number" },
              "changed": { "type": "number" },
              "deleted": { "type": "number" }
            }
          }
        }
      }
    },
    "source": { "enum": ["web_editor", "api", "bulk_import", "model_seed"] },
    "client_version": { "type": "string" },
    "session_id": { "type": "string" },
    "duration_seconds": { "type": "number" },
    "tools_used": { "type": "array", "items": { "type": "string" } },
    "auto_assist": {
      "type": "object",
      "properties": {
        "model_version_id": { "type": "string" },
        "features_auto_generated": { "type": "number" },
        "features_manually_corrected": { "type": "number" }
      }
    },
    "base_imagery": {
      "type": "object",
      "properties": {
        "asset_id": { "type": "string" },
        "datetime": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

#### Example Document

```json
{
  "ann_set_id": "as123456-78ab-cdef-0123-456789abcdef",
  "commit_id": "co123456-78ab-cdef-0123-456789abcdef",
  "parent_commit_id": "co000000-78ab-cdef-0123-456789abcdef",
  "author_id": "us123456-78ab-cdef-0123-456789abcdef",
  "created_at": "2026-02-15T14:30:00Z",
  "message": "Annotated block B-12, corrected 12 misclassified trees",
  "review_status": "pending",
  "reviewed_by": null,
  "reviewed_at": null,
  "diff_summary": {
    "added": 45,
    "changed": 12,
    "deleted": 3,
    "by_label": {
      "palm_tree": { "added": 40, "changed": 10, "deleted": 2 },
      "dead_tree": { "added": 5, "changed": 2, "deleted": 1 }
    }
  },
  "source": "web_editor",
  "client_version": "0.5.2",
  "session_id": "sess-abc-123",
  "duration_seconds": 1847,
  "tools_used": ["polygon", "point", "auto_segment"],
  "auto_assist": {
    "model_version_id": "mv-sam-v1-...",
    "features_auto_generated": 30,
    "features_manually_corrected": 8
  },
  "base_imagery": {
    "asset_id": "as123456-...",
    "datetime": "2026-01-15T03:20:00Z"
  }
}
```

---

## G) Initial DDL Skeleton

> 以下 DDL 覆盖全部 38 张表，可直接作为 Alembic migration 起点。

```sql
-- ============================================================
-- PalmView GeoAI Platform — DDL Skeleton v2.0
-- Generated: 2026-02-20
-- ============================================================

BEGIN;

-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Domain 1: Tenancy & Access Control
-- ============================================================

CREATE TABLE orgs (
    org_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    plan        VARCHAR(50) DEFAULT 'free',
    settings    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE TABLE users (
    user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    name            VARCHAR(255),
    avatar_url      TEXT,
    auth_provider   VARCHAR(50) NOT NULL,
    auth_subject    VARCHAR(255) NOT NULL,
    is_superadmin   BOOLEAN DEFAULT false,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (auth_provider, auth_subject)
);

CREATE TABLE roles (
    role_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID REFERENCES orgs(org_id),
    name        VARCHAR(100) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]',
    is_system   BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (org_id, name)
);

CREATE TABLE memberships (
    membership_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role_id     UUID NOT NULL REFERENCES roles(role_id),
    status      VARCHAR(30) DEFAULT 'active',
    invited_by  UUID REFERENCES users(user_id),
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (org_id, user_id)
);

CREATE TABLE projects (
    project_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL,
    description TEXT,
    region      VARCHAR(100),
    bbox        geometry(Polygon, 4326),
    settings    JSONB DEFAULT '{}',
    created_by  UUID REFERENCES users(user_id),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    archived_at TIMESTAMPTZ,
    UNIQUE (org_id, slug)
);
CREATE INDEX idx_projects_bbox ON projects USING GIST (bbox);

CREATE TABLE project_memberships (
    project_id      UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    project_role    VARCHAR(50) NOT NULL DEFAULT 'member',
    created_at      TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);

CREATE TABLE api_keys (
    api_key_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(user_id),
    name        VARCHAR(255) NOT NULL,
    key_hash    VARCHAR(255) NOT NULL,
    key_prefix  VARCHAR(10) NOT NULL UNIQUE,
    scopes      JSONB DEFAULT '["*"]',
    expires_at  TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT now(),
    revoked_at  TIMESTAMPTZ
);

CREATE TABLE audit_logs (
    audit_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(org_id),
    user_id         UUID REFERENCES users(user_id),
    action          VARCHAR(100) NOT NULL,
    target_type     VARCHAR(100) NOT NULL,
    target_id       UUID,
    payload         JSONB DEFAULT '{}',
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_org_time ON audit_logs (org_id, created_at DESC);
CREATE INDEX idx_audit_target ON audit_logs (target_type, target_id);

CREATE TABLE quotas (
    org_id      UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    period      DATE NOT NULL,
    metric_key  VARCHAR(100) NOT NULL,
    used        BIGINT DEFAULT 0,
    "limit"     BIGINT,
    updated_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (org_id, period, metric_key)
);

-- ============================================================
-- Domain 2: Spatial Assets
-- ============================================================

CREATE TABLE farms (
    farm_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    project_id  UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    farm_type   VARCHAR(50) NOT NULL DEFAULT 'palm_plantation',
    geom        geometry(MultiPolygon, 4326),
    area_ha     NUMERIC(12,4),
    props       JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_farms_geom ON farms USING GIST (geom);
CREATE INDEX idx_farms_project ON farms (project_id);

CREATE TABLE blocks (
    block_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    farm_id     UUID NOT NULL REFERENCES farms(farm_id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    geom        geometry(MultiPolygon, 4326) NOT NULL,
    planting_year INTEGER,
    props       JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_blocks_geom ON blocks USING GIST (geom);
CREATE INDEX idx_blocks_farm ON blocks (farm_id);

CREATE TABLE rois (
    roi_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    project_id  UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    name        VARCHAR(255),
    geom        geometry(Polygon, 4326) NOT NULL,
    source      VARCHAR(50) DEFAULT 'manual',
    source_id   UUID,
    props       JSONB DEFAULT '{}',
    created_by  UUID REFERENCES users(user_id),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX idx_rois_geom ON rois USING GIST (geom);
CREATE INDEX idx_rois_project ON rois (project_id);

CREATE TABLE tags (
    tag_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id  UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    name    VARCHAR(100) NOT NULL,
    color   VARCHAR(7),
    UNIQUE (org_id, name)
);

CREATE TABLE taggings (
    tag_id          UUID NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
    taggable_type   VARCHAR(50) NOT NULL,
    taggable_id     UUID NOT NULL,
    PRIMARY KEY (tag_id, taggable_type, taggable_id)
);
CREATE INDEX idx_taggings_target ON taggings (taggable_type, taggable_id);

-- ============================================================
-- Domain 3: STAC Integration
-- ============================================================

CREATE TABLE stac_remotes (
    stac_remote_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    stac_api_url    TEXT NOT NULL,
    auth            JSONB DEFAULT '{}',
    default_collection VARCHAR(255),
    enabled         BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_stac_remotes_project ON stac_remotes (project_id);

-- Forward declaration: imagery_assets FK added after table creation
CREATE TABLE stac_asset_links (
    link_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    project_id          UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    source              VARCHAR(30) NOT NULL,
    stac_api_url        TEXT,
    collection_id       VARCHAR(255) NOT NULL,
    item_id             VARCHAR(255) NOT NULL,
    asset_key           VARCHAR(100),
    asset_id            UUID,  -- FK added after imagery_assets
    acquired_at         TIMESTAMPTZ,
    footprint           geometry(Polygon, 4326),
    gsd_cm              INTEGER,
    cloud_cover_pct     NUMERIC(5,2),
    bands               JSONB,
    platform            VARCHAR(100),
    props               JSONB DEFAULT '{}',
    synced_at           TIMESTAMPTZ DEFAULT now(),
    UNIQUE (stac_api_url, collection_id, item_id, asset_key)
);
CREATE INDEX idx_stac_links_footprint ON stac_asset_links USING GIST (footprint);
CREATE INDEX idx_stac_links_project_time ON stac_asset_links (project_id, acquired_at DESC);

-- ============================================================
-- Domain 4: GEE Integration
-- ============================================================

CREATE TABLE gee_sources (
    gee_source_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES orgs(org_id),
    project_id      UUID REFERENCES projects(project_id),
    collection_id   VARCHAR(255) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    query_templates JSONB NOT NULL,
    default_params  JSONB DEFAULT '{}',
    description     TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (project_id, collection_id)
);

-- Forward declaration: imagery_assets FK added after table creation
CREATE TABLE gee_exports (
    gee_export_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(project_id),
    gee_source_id   UUID NOT NULL REFERENCES gee_sources(gee_source_id),
    roi_id          UUID REFERENCES rois(roi_id),
    status          VARCHAR(30) NOT NULL DEFAULT 'pending',
    gee_task_id     VARCHAR(255),
    time_from       DATE NOT NULL,
    time_to         DATE NOT NULL,
    params          JSONB NOT NULL,
    output_asset_id UUID,  -- FK added after imagery_assets
    error_message   TEXT,
    created_by      UUID REFERENCES users(user_id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    submitted_at    TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ
);
CREATE INDEX idx_gee_exports_status ON gee_exports (org_id, status);
CREATE INDEX idx_gee_exports_task ON gee_exports (gee_task_id);

-- ============================================================
-- Domain 5: Imagery & Data Products (Unified Asset Hub)
-- ============================================================

CREATE TABLE imagery_assets (
    asset_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    name            VARCHAR(255),
    asset_type      VARCHAR(50) NOT NULL,
    source_type     VARCHAR(30) NOT NULL,
    uri             TEXT NOT NULL,
    format          VARCHAR(30),
    stac_link_id    UUID REFERENCES stac_asset_links(link_id),
    gee_export_id   UUID REFERENCES gee_exports(gee_export_id),
    acquired_at     TIMESTAMPTZ,
    footprint       geometry(Polygon, 4326),
    gsd_cm          INTEGER,
    bands           JSONB,
    crs             VARCHAR(30) DEFAULT 'EPSG:4326',
    size_bytes      BIGINT,
    checksum        VARCHAR(64),
    tile_endpoint   TEXT,
    props           JSONB DEFAULT '{}',
    created_by      UUID REFERENCES users(user_id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_assets_footprint ON imagery_assets USING GIST (footprint);
CREATE INDEX idx_assets_project_time ON imagery_assets (project_id, acquired_at DESC);
CREATE INDEX idx_assets_source ON imagery_assets (source_type);

-- Now add deferred FKs
ALTER TABLE stac_asset_links
    ADD CONSTRAINT fk_stac_links_asset
    FOREIGN KEY (asset_id) REFERENCES imagery_assets(asset_id);

ALTER TABLE gee_exports
    ADD CONSTRAINT fk_gee_exports_asset
    FOREIGN KEY (output_asset_id) REFERENCES imagery_assets(asset_id);

-- ============================================================
-- Domain 6: Model Registry & Inference Workflow
-- ============================================================

CREATE TABLE models (
    model_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL,
    task_type   VARCHAR(50) NOT NULL,
    description TEXT,
    created_by  UUID REFERENCES users(user_id),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    archived_at TIMESTAMPTZ,
    UNIQUE (org_id, slug)
);

CREATE TABLE model_versions (
    model_version_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    model_id            UUID NOT NULL REFERENCES models(model_id) ON DELETE CASCADE,
    version             VARCHAR(50) NOT NULL,
    status              VARCHAR(30) DEFAULT 'draft',
    artifact_uri        TEXT NOT NULL,
    artifact_format     VARCHAR(30),
    artifact_size_bytes BIGINT,
    artifact_checksum   VARCHAR(64),
    input_spec          JSONB NOT NULL,
    output_spec         JSONB NOT NULL,
    metrics             JSONB DEFAULT '{}',
    provenance          JSONB DEFAULT '{}',
    runtime_config      JSONB DEFAULT '{}',
    notes               TEXT,
    created_by          UUID REFERENCES users(user_id),
    created_at          TIMESTAMPTZ DEFAULT now(),
    promoted_at         TIMESTAMPTZ,
    UNIQUE (model_id, version)
);
CREATE INDEX idx_model_ver_status ON model_versions (model_id, status);

CREATE TABLE inference_jobs (
    job_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    project_id          UUID NOT NULL REFERENCES projects(project_id),
    model_version_id    UUID NOT NULL REFERENCES model_versions(model_version_id),
    asset_id            UUID REFERENCES imagery_assets(asset_id),
    roi_id              UUID REFERENCES rois(roi_id),
    name                VARCHAR(255),
    status              VARCHAR(30) NOT NULL DEFAULT 'pending',
    params              JSONB DEFAULT '{}',
    priority            INTEGER DEFAULT 0,
    input_snapshot      JSONB,
    worker_id           VARCHAR(100),
    progress            NUMERIC(5,2) DEFAULT 0,
    error               TEXT,
    created_by          UUID REFERENCES users(user_id),
    created_at          TIMESTAMPTZ DEFAULT now(),
    started_at          TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ
);
CREATE INDEX idx_jobs_project ON inference_jobs (org_id, project_id);
CREATE INDEX idx_jobs_model ON inference_jobs (model_version_id);
CREATE INDEX idx_jobs_queue ON inference_jobs (status) WHERE status IN ('pending', 'queued', 'running');

CREATE TABLE inference_outputs (
    output_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(org_id),
    job_id          UUID NOT NULL REFERENCES inference_jobs(job_id) ON DELETE CASCADE,
    output_type     VARCHAR(30) NOT NULL,
    format          VARCHAR(30) NOT NULL,
    uri             TEXT NOT NULL,
    tile_endpoint   TEXT,
    bbox            geometry(Polygon, 4326),
    crs             VARCHAR(30) DEFAULT 'EPSG:4326',
    stats           JSONB DEFAULT '{}',
    manifest        JSONB DEFAULT '{}',
    size_bytes      BIGINT,
    asset_id        UUID REFERENCES imagery_assets(asset_id),
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_outputs_job ON inference_outputs (job_id);
CREATE INDEX idx_outputs_bbox ON inference_outputs USING GIST (bbox);

CREATE TABLE inference_result_index (
    idx_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES orgs(org_id),
    project_id          UUID NOT NULL REFERENCES projects(project_id),
    output_id           UUID NOT NULL REFERENCES inference_outputs(output_id) ON DELETE CASCADE,
    model_version_id    UUID REFERENCES model_versions(model_version_id),
    task_type           VARCHAR(50),
    label_key           VARCHAR(100),
    time_key            TIMESTAMPTZ,
    geom                geometry(Polygon, 4326),
    roi_id              UUID REFERENCES rois(roi_id),
    feature_count       INTEGER,
    confidence_mean     NUMERIC(5,4),
    props               JSONB DEFAULT '{}'
);
CREATE INDEX idx_result_geom ON inference_result_index USING GIST (geom);
CREATE INDEX idx_result_query ON inference_result_index (project_id, time_key DESC);
CREATE INDEX idx_result_label ON inference_result_index (label_key);
CREATE INDEX idx_result_model ON inference_result_index (model_version_id);

-- ============================================================
-- Domain 7: Annotation & Review Versioning
-- ============================================================

CREATE TABLE annotation_tasks (
    task_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(project_id),
    asset_id        UUID REFERENCES imagery_assets(asset_id),
    roi_id          UUID REFERENCES rois(roi_id),
    seed_output_id  UUID REFERENCES inference_outputs(output_id),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    task_type       VARCHAR(50) NOT NULL,
    label_schema    JSONB NOT NULL,
    status          VARCHAR(30) DEFAULT 'open',
    assigned_to     UUID[],
    due_date        DATE,
    created_by      UUID REFERENCES users(user_id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_annot_tasks_project ON annotation_tasks (org_id, project_id);

CREATE TABLE annotation_sets (
    ann_set_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    task_id         UUID NOT NULL REFERENCES annotation_tasks(task_id) ON DELETE CASCADE,
    name            VARCHAR(255) DEFAULT 'default',
    head_commit_id  UUID,  -- FK added after annotation_commits
    feature_count   INTEGER DEFAULT 0,
    created_by      UUID REFERENCES users(user_id),
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_annot_sets_task ON annotation_sets (task_id);

CREATE TABLE annotation_commits (
    commit_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES orgs(org_id),
    ann_set_id          UUID NOT NULL REFERENCES annotation_sets(ann_set_id) ON DELETE CASCADE,
    parent_commit_id    UUID REFERENCES annotation_commits(commit_id),
    message             TEXT,
    author_id           UUID NOT NULL REFERENCES users(user_id),
    stats               JSONB DEFAULT '{}',
    metadata            JSONB DEFAULT '{}',
    review_status       VARCHAR(30),
    reviewed_by         UUID REFERENCES users(user_id),
    reviewed_at         TIMESTAMPTZ,
    review_comment      TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_commits_set ON annotation_commits (ann_set_id, created_at DESC);

-- Deferred FK for head_commit_id
ALTER TABLE annotation_sets
    ADD CONSTRAINT fk_head_commit
    FOREIGN KEY (head_commit_id) REFERENCES annotation_commits(commit_id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE annotation_features (
    feature_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(org_id),
    commit_id   UUID NOT NULL REFERENCES annotation_commits(commit_id) ON DELETE CASCADE,
    object_id   UUID NOT NULL,
    geom        geometry(Geometry, 4326),
    label_key   VARCHAR(100),
    label_value VARCHAR(255),
    properties  JSONB DEFAULT '{}',
    confidence  NUMERIC(5,4),
    is_deleted  BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_feat_geom ON annotation_features USING GIST (geom);
CREATE INDEX idx_feat_commit ON annotation_features (commit_id);
CREATE INDEX idx_feat_object ON annotation_features (object_id, created_at DESC);

CREATE TABLE training_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    project_id  UUID NOT NULL REFERENCES projects(project_id),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    ann_set_id  UUID NOT NULL REFERENCES annotation_sets(ann_set_id),
    commit_id   UUID NOT NULL REFERENCES annotation_commits(commit_id),
    format      VARCHAR(30) NOT NULL,
    uri         TEXT NOT NULL,
    stats       JSONB DEFAULT '{}',
    size_bytes  BIGINT,
    checksum    VARCHAR(64),
    created_by  UUID REFERENCES users(user_id),
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Domain 8: Kepler Map Config Versioning
-- ============================================================

CREATE TABLE map_configs (
    map_config_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES map_configs(map_config_id),
    version         INTEGER NOT NULL,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    kepler_config   JSONB NOT NULL,
    dataset_refs    JSONB NOT NULL DEFAULT '[]',
    tags            TEXT[],
    created_by      UUID REFERENCES users(user_id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (project_id, version)
);
CREATE INDEX idx_map_configs_project ON map_configs (project_id, created_at DESC);

CREATE TABLE map_config_releases (
    release_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(org_id),
    map_config_id   UUID NOT NULL REFERENCES map_configs(map_config_id),
    channel         VARCHAR(50) NOT NULL DEFAULT 'production',
    released_by     UUID NOT NULL REFERENCES users(user_id),
    released_at     TIMESTAMPTZ DEFAULT now(),
    notes           TEXT
);
CREATE INDEX idx_releases_config ON map_config_releases (map_config_id);

CREATE TABLE map_config_shares (
    share_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(org_id),
    map_config_id   UUID NOT NULL REFERENCES map_configs(map_config_id) ON DELETE CASCADE,
    visibility      VARCHAR(30) NOT NULL,
    token           VARCHAR(64) UNIQUE,
    permissions     JSONB DEFAULT '{"view": true}',
    expires_at      TIMESTAMPTZ,
    created_by      UUID REFERENCES users(user_id),
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_shares_token ON map_config_shares (token) WHERE token IS NOT NULL;

-- ============================================================
-- Domain 9: Robot / IoT Extension
-- ============================================================

CREATE TABLE device_types (
    device_type_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES orgs(org_id),
    name            VARCHAR(100) NOT NULL,
    category        VARCHAR(30) NOT NULL,
    capabilities    JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE devices (
    device_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    device_type_id  UUID NOT NULL REFERENCES device_types(device_type_id),
    name            VARCHAR(255) NOT NULL,
    serial          VARCHAR(100),
    status          VARCHAR(30) DEFAULT 'idle',
    last_seen_at    TIMESTAMPTZ,
    props           JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    retired_at      TIMESTAMPTZ
);
CREATE INDEX idx_devices_org ON devices (org_id, status);

CREATE TABLE missions (
    mission_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    project_id  UUID REFERENCES projects(project_id),
    device_id   UUID NOT NULL REFERENCES devices(device_id),
    name        VARCHAR(255),
    mission_type VARCHAR(50),
    status      VARCHAR(30) DEFAULT 'planned',
    roi_id      UUID REFERENCES rois(roi_id),
    started_at  TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    props       JSONB DEFAULT '{}',
    created_by  UUID REFERENCES users(user_id),
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_missions_project ON missions (org_id, project_id);
CREATE INDEX idx_missions_device ON missions (device_id);

CREATE TABLE mission_tracks (
    track_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(org_id),
    mission_id  UUID NOT NULL REFERENCES missions(mission_id) ON DELETE CASCADE,
    geom        geometry(LineString, 4326) NOT NULL,
    time_from   TIMESTAMPTZ NOT NULL,
    time_to     TIMESTAMPTZ NOT NULL,
    stats       JSONB DEFAULT '{}'
);
CREATE INDEX idx_tracks_geom ON mission_tracks USING GIST (geom);
CREATE INDEX idx_tracks_mission ON mission_tracks (mission_id);

CREATE TABLE mission_events (
    event_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(org_id),
    mission_id  UUID NOT NULL REFERENCES missions(mission_id) ON DELETE CASCADE,
    event_type  VARCHAR(50) NOT NULL,
    geom        geometry(Point, 4326),
    occurred_at TIMESTAMPTZ NOT NULL,
    payload     JSONB DEFAULT '{}'
);
CREATE INDEX idx_events_geom ON mission_events USING GIST (geom);
CREATE INDEX idx_events_mission_time ON mission_events (mission_id, occurred_at);

CREATE TABLE telemetry_refs (
    telemetry_ref_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES orgs(org_id),
    device_id   UUID NOT NULL REFERENCES devices(device_id),
    mission_id  UUID REFERENCES missions(mission_id),
    storage_type VARCHAR(30) NOT NULL,
    uri         TEXT NOT NULL,
    schema      JSONB,
    time_from   TIMESTAMPTZ NOT NULL,
    time_to     TIMESTAMPTZ NOT NULL,
    row_count   BIGINT,
    size_bytes  BIGINT,
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_telemetry_device ON telemetry_refs (device_id, time_from);
CREATE INDEX idx_telemetry_mission ON telemetry_refs (mission_id);

-- ============================================================
-- Phase 2 Materialized Views
-- ============================================================

-- MV1: Annotation Head View — current state of each object in a set
-- Replaces expensive DISTINCT ON queries for annotation editing UI
CREATE MATERIALIZED VIEW annotation_features_current AS
SELECT DISTINCT ON (af.object_id)
    af.object_id,
    af.geom,
    af.label_key,
    af.label_value,
    af.properties,
    af.confidence,
    af.commit_id,
    af.org_id,
    af.created_at,
    aset.ann_set_id,
    aset.task_id
FROM annotation_features af
JOIN annotation_commits ac ON af.commit_id = ac.commit_id
JOIN annotation_sets aset ON ac.ann_set_id = aset.ann_set_id
WHERE af.is_deleted = false
ORDER BY af.object_id, af.created_at DESC;

CREATE UNIQUE INDEX idx_current_object ON annotation_features_current (object_id);
CREATE INDEX idx_current_geom ON annotation_features_current USING GIST (geom);
CREATE INDEX idx_current_set ON annotation_features_current (ann_set_id);
CREATE INDEX idx_current_label ON annotation_features_current (label_key, label_value);

-- Refresh strategy: REFRESH CONCURRENTLY after each commit
-- For <100k features per set, refresh takes <1s
-- Phase 3: Consider Redis cache for high-frequency editing sessions

-- MV2: Inference Result Stats Aggregation — per-project summary
-- Powers dashboard widgets and project overview pages
CREATE MATERIALIZED VIEW inference_result_stats AS
SELECT
    iri.project_id,
    iri.org_id,
    iri.model_version_id,
    iri.task_type,
    iri.label_key,
    COUNT(*)                            AS result_count,
    SUM(iri.feature_count)              AS total_features,
    AVG(iri.confidence_mean)            AS avg_confidence,
    MIN(iri.time_key)                   AS earliest,
    MAX(iri.time_key)                   AS latest,
    ST_Extent(iri.geom)                 AS extent,
    COUNT(DISTINCT iri.roi_id)          AS roi_count,
    COUNT(DISTINCT iri.model_version_id) AS model_version_count
FROM inference_result_index iri
GROUP BY iri.project_id, iri.org_id, iri.model_version_id, iri.task_type, iri.label_key;

CREATE UNIQUE INDEX idx_result_stats_pk ON inference_result_stats (project_id, model_version_id, task_type, label_key);
CREATE INDEX idx_result_stats_org ON inference_result_stats (org_id);

-- Refresh strategy: REFRESH CONCURRENTLY after inference job completion
-- Or on a schedule (e.g., every 5 minutes via pg_cron)

-- ============================================================
-- Row Level Security (Apply to all business tables)
-- ============================================================

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'projects', 'farms', 'blocks', 'rois', 'tags',
            'stac_remotes', 'stac_asset_links',
            'gee_sources', 'gee_exports',
            'imagery_assets',
            'models', 'model_versions',
            'inference_jobs', 'inference_outputs', 'inference_result_index',
            'annotation_tasks', 'annotation_sets', 'annotation_commits', 'annotation_features',
            'training_snapshots',
            'map_configs', 'map_config_releases', 'map_config_shares',
            'devices', 'missions', 'mission_tracks', 'mission_events', 'telemetry_refs'
        ])
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format(
            'CREATE POLICY org_isolation_%I ON %I USING (org_id = current_setting(''app.current_org'', true)::uuid)',
            tbl, tbl
        );
    END LOOP;
END $$;

-- Superadmin bypass policy (example for projects)
-- CREATE POLICY superadmin_bypass ON projects USING (
--     current_setting('app.is_superadmin', true)::boolean = true
-- );

-- ============================================================
-- Utility Triggers
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'orgs', 'users', 'projects', 'farms', 'rois',
            'imagery_assets', 'models', 'annotation_tasks'
        ])
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            tbl, tbl
        );
    END LOOP;
END $$;

-- Prevent modification of released map configs
CREATE OR REPLACE FUNCTION prevent_released_config_update()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM map_config_releases
        WHERE map_config_id = OLD.map_config_id
    ) THEN
        RAISE EXCEPTION 'Cannot modify map config % — it has been released', OLD.map_config_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_map_config_immutable
    BEFORE UPDATE ON map_configs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_released_config_update();

COMMIT;
```

---

## Appendix: Table Count Summary

| Domain | Tables | MVP | Phase 2 | Phase 3 |
|--------|--------|-----|---------|---------|
| 1. Tenancy & Access | 8 | 6 | +2 | — |
| 2. Spatial Assets | 5 | 3 | +2 | — |
| 3. STAC Integration | 2 | 2 | — | — |
| 4. GEE Integration | 2 | — | +2 | — |
| 5. Imagery Assets | 1 | 1 | — | — |
| 6. Model + Inference | 5 | 5 | — | — |
| 7. Annotation & Review | 5 | — | +5 | — |
| 8. Kepler Configs | 3 | 3 | — | — |
| 9. Robot/IoT | 6 | — | — | +6 |
| **Total** | **37** | **20** | **+11** | **+6** |

---

## Appendix: Comparison with Reference Design — 与参考设计对比

| Aspect | 参考设计 | 本设计 | 说明 |
|--------|---------|--------|------|
| `imagery_assets` 统一入口 | ✅ | ✅ 采纳 | 核心创新，source-agnostic 资产管理 |
| `stac_remotes` 外部源管理 | ✅ | ✅ 采纳 | 分离内部/外部 STAC |
| `project_memberships` | ✅ 可选 | ✅ 采纳 | 项目级细粒度 RBAC |
| `mission_tracks` 独立表 | ✅ | ✅ 采纳 | 支持多段轨迹 |
| `telemetry_refs` 引用模式 | ✅ | ✅ 采纳 | 重数据在 S3，DB 只存引用 |
| `map_config_releases` 独立表 | ✅ | ✅ 采纳 | 支持多通道发布 |
| `farms` vs `sites` | farms | ✅ farms | 更贴合农业场景 |
| Review 模型 | commit 内嵌 | ✅ commit 内嵌 | 简化 1:1 关系，减少 JOIN |
| `dataset_refs` | JSONB 内嵌 | ✅ JSONB 内嵌 | 与 config 原子版本化 |
| PK 命名 | `{entity}_id` | ✅ `{entity}_id` | JOIN 可读性更好 |
| Job/Run 分离 | 单表 | ✅ 单表 MVP | 避免过度设计，Phase 2 可拆分 |
| `label_key` + `label_value` | ✅ | ✅ 采纳 | 比单一 `label` 更灵活 |
| `quotas` 独立表 | ✅ | ✅ 采纳 | 清晰的计费 hook |

---

*Document generated by SYNGA Database Architecture Team. v2.0 incorporates reference design patterns.*  
*For questions or review, contact the platform engineering lead.*
