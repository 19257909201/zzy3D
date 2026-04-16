# 开发文档

## 1. 项目简介

本项目是一个基于 Next.js 16 App Router、React 19 和 Three.js 的园林 3D 导览应用。服务端负责发现和提供模型、地图图片等资源，客户端负责地图交互、3D 渲染、文案展示、音频控制和转场效果。

## 2. 技术栈

- 框架：Next.js `16.2.2`
- 视图库：React `19.2.4`
- 3D 引擎：Three.js `^0.183.2`
- 样式方案：Tailwind CSS `^4`
- 语言：TypeScript `^5`
- 代码规范：ESLint `^9`

说明：

- 项目使用 App Router 结构，首页由 `app/page.tsx` 提供。
- 页面同时使用 Server Component 和 Client Component。
- 3D 模型相关逻辑集中在客户端组件中动态执行，以避免服务端环境加载 WebGL 逻辑。

## 3. 本地开发

### 3.1 安装依赖

```bash
npm install
```

### 3.2 启动开发环境

```bash
npm run dev
```

默认访问地址：

```text
http://localhost:3000
```

### 3.3 常用命令

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## 4. 目录结构

```text
app/
  api/
    layout-image/route.ts    地图底图接口
    model/route.ts           GLB 模型流式接口
  globals.css                全局样式与主题变量
  layout.tsx                 根布局与 metadata
  page.tsx                   首页 Server Component

components/
  ModelViewer.tsx            核心交互组件，承载总览态与单体态

lib/
  site-models.ts             模型清单、元数据、资源发现逻辑

glbfile/
  *.glb                      建筑模型文件
  location.png               园林总平面图

public/
  audio/*.mp3                建筑对应讲解音频

docs/
  design.md                  设计文档
  development.md             开发文档
```

## 5. 架构说明

### 5.1 页面架构

页面分为两层：

- 服务端入口层：`app/page.tsx`
- 客户端交互层：`components/ModelViewer.tsx`

服务端入口层职责：

- 调用 `getAvailableSiteModels()`
- 在服务端读取当前可用模型列表
- 将模型概要数据传给客户端组件

客户端交互层职责：

- 管理总览态和单体态切换
- 管理墨迹转场状态
- 加载 3D 模型并初始化 Three.js 场景
- 管理解说面板与音频播放

### 5.2 数据来源

项目数据目前不是来自数据库，而是来自本地文件系统和静态配置。

数据由两部分组成：

- 静态元数据：定义在 `lib/site-models.ts` 的 `SITE_MODEL_CATALOG`
- 资源文件：`glbfile/*.glb`、`glbfile/location.png`、`public/audio/*`

读取逻辑：

1. 服务端扫描 `glbfile` 目录中的 `.glb` 文件。
2. 将扫描结果与 `SITE_MODEL_CATALOG` 按 `slug` 对齐。
3. 已配置的模型返回完整元数据。
4. 未配置但实际存在的模型会生成兜底文案和默认地图位置。

这意味着：

- 模型文件是“真数据源”。
- 元数据配置是“增强层”。
- 就算忘记配置文案，只要 GLB 文件存在，应用仍可展示该模型。

### 5.3 资源访问方式

模型和地图图片不直接从 `public` 目录暴露，而是通过 Route Handler 按需输出。

原因：

- 可以在服务端校验 `slug`
- 可以统一设置响应头
- 可以为后续鉴权、缓存策略和统计埋点预留扩展点

## 6. 核心模块说明

### 6.1 `lib/site-models.ts`

该模块是资源层和内容层之间的桥梁，主要职责：

- 保存建筑元数据目录
- 提供地图图片路径
- 提供当前可用模型列表
- 提供单个建筑模型资源信息

核心导出：

- `getAvailableSiteModels()`
- `getSiteModelAsset(slug)`
- `getLocationImagePath()`

关键约束：

- `slug` 必须符合安全正则 `^[a-z0-9-]+$`
- 模型文件名规则固定为 `{slug}.glb`

### 6.2 `app/api/model/route.ts`

职责：

- 接收查询参数 `slug`
- 校验 `slug` 是否存在且可读
- 将对应 GLB 文件以流方式返回

接口说明：

- 方法：`GET`
- 路径：`/api/model?slug=<slug>`
- 成功：返回 `model/gltf-binary`
- 失败：
  - `400`：缺少 `slug`
  - `404`：模型不存在或不可读
  - `500`：服务端读取失败

当前缓存策略：

- `Cache-Control: no-store`

### 6.3 `app/api/layout-image/route.ts`

职责：

- 输出园林总平面图 `location.png`

接口说明：

- 方法：`GET`
- 路径：`/api/layout-image`
- 成功：返回 `image/png`
- 失败：
  - `404`：底图不存在
  - `500`：服务端读取失败

当前缓存策略：

- `Cache-Control: no-store`

### 6.4 `components/ModelViewer.tsx`

这是项目的核心交互组件，当前承载了大部分前端逻辑。

内部主要由以下子区块组成：

- `InkWashOverlay`
  负责总览态与单体态之间的墨迹转场。

- `OverviewMapFrame`
  负责地图底图的固定铺满与预览层容器。

- `MapBuildingLift`
  负责从地图底图中裁切建筑区域并做“上浮高亮”动效。

- `MapLabel`
  负责地图上的建筑书法标签与交互入口。

- `DirectoryDrawer`
  负责目录按钮、目录面板和建筑列表。

- `OverviewStage`
  负责总览态的聚合视图。

- `SingleModelStage`
  负责单体态的模型加载、渲染、解说和音频播放。

### 6.5 Three.js 初始化流程

`SingleModelStage` 中的模型渲染流程如下：

1. 动态导入 `three`、`GLTFLoader`、`OrbitControls`
2. 创建 `Scene`、`PerspectiveCamera`、`WebGLRenderer`
3. 初始化环境光、半球光、主光、补光、轮廓光
4. 调用 `/api/model` 加载指定建筑的 GLB
5. 计算模型包围盒、中心点和包围球半径
6. 将模型移到视图中心，并设置合适相机距离
7. 添加地面雾气贴图精灵
8. 播放开场旋转动画
9. 动画完成后启用 `OrbitControls`

性能相关处理：

- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`
- 使用 `ResizeObserver` 监听容器尺寸变化
- 在组件卸载或切换模型时清理几何体、材质、贴图和 renderer

## 7. 状态管理

项目没有引入外部状态库，所有状态均在组件内部管理。

### 7.1 页面级状态

`ModelViewer` 负责：

- `displayedSlug`
- `transitionPhase`
- `transitionKind`
- `transitionLabel`
- `isMapFontReady`

作用：

- 确定当前显示总览还是建筑
- 管理墨迹转场时机
- 管理书法字体加载完成后的显示状态

### 7.2 建筑级状态

`SingleModelStage` 负责：

- `viewerState`
- `isDrawerOpen`
- `isInterpretationReady`
- `isInterpretationOpen`
- `typedInterpretation`
- `isNarrationEnabled`
- `isNarrationAvailable`
- `narrationAudioSrc`

作用：

- 管理模型加载态、错误态、完成态
- 管理解说显隐和逐字输出
- 管理音频可用性检测和播放开关

## 8. 新增或维护建筑内容

### 8.1 新增一个建筑模型

1. 将模型文件放入 `glbfile/`，文件名必须为 `{slug}.glb`
2. 在 `lib/site-models.ts` 的 `SITE_MODEL_CATALOG` 中增加对应配置
3. 填写地图位置、摘要、诗句、解说文案等字段
4. 如需旁白，将音频文件放入 `public/audio/`
5. 音频文件名建议与 `slug` 一致，例如 `yuanxiangtang.mp3`

### 8.2 只新增模型文件、不补元数据

应用仍会显示该模型，但会使用兜底策略：

- 标签由 `slug` 推导
- 文案使用默认占位内容
- 地图位置自动落在底部默认排布区域

这适合开发阶段做资源联调，不适合作为最终上线内容。

### 8.3 修改地图落点

在 `SITE_MODEL_CATALOG` 中修改：

- `mapPosition.x`
- `mapPosition.y`
- `mapSize.width`
- `mapSize.height`

其中：

- `mapPosition` 使用相对比例坐标
- `mapSize` 用于控制地图高亮裁切区域大小

## 9. 样式与视觉实现

### 9.1 样式体系

当前样式以 Tailwind 原子类为主，少量全局变量定义在 `app/globals.css`。

现有特点：

- 颜色主要直接写在组件中，适合快速打磨视觉，但后续抽主题会有重复
- 大部分动效通过 CSS transition 和少量 `style jsx` 实现
- 视觉基元已经相对稳定，适合下一步提炼为可复用 token

### 9.2 建议的演进方向

- 提取纸本面板、按钮、悬浮信息卡等设计 token
- 将配色和阴影收敛到 CSS 变量
- 将 `ModelViewer.tsx` 中的视觉块进一步拆分成独立组件

## 10. 已知技术特点与风险

### 10.1 当前特点

- 代码结构简单，功能集中，适合快速迭代
- 内容与资源配置清晰，维护门槛不高
- 单文件组件较大，阅读和扩展成本正在上升

### 10.2 风险点

- `ModelViewer.tsx` 职责偏多，后续增加功能时容易膨胀
- GLB 文件体积较大，首次加载成本高
- 当前没有自动化测试
- 当前资源接口统一设置为 `no-store`，线上性能和带宽成本会受影响

## 11. 重构建议

优先级从高到低如下：

1. 将 `ModelViewer.tsx` 拆分为 `overview/`、`viewer/`、`transition/`、`shared/` 等子模块
2. 将建筑内容从 `lib/site-models.ts` 迁移到独立内容文件或 CMS 数据源
3. 为模型资源增加版本化缓存策略
4. 为交互状态增加最小粒度的单元测试和集成测试
5. 引入模型压缩和资源预加载策略

## 12. 测试与发布建议

### 12.1 当前建议的最小验证项

- 首页是否能正确显示园林总览
- 点击任一建筑是否能进入单体态
- 模型加载失败时是否有错误提示
- 解说文本是否在模型开场动画完成后出现
- 有音频的建筑是否能检测并播放旁白
- 不存在音频的建筑是否显示不可用状态
- 返回总览和建筑切换时转场是否正常

### 12.2 发布前建议

- 压缩 GLB 文件体积
- 为图片和模型接口设置更合理的缓存头
- 为移动端进行一次真机交互验证
- 增加错误监控和性能监控
