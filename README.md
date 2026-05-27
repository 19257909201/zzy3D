# web3d

一个以 3D 建筑模型为核心的园林数字导览项目。用户可以在园林总平面图中选择建筑，进入对应的 3D 模型浏览视图，并查看配套解说与音频旁白。

## 技术栈

- Next.js 16
- React 19
- Three.js
- Tailwind CSS 4
- TypeScript

## 本地运行

```bash
npm install
npm run dev
```

访问：

```text
http://localhost:8080
```

## 常用命令

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## 文档

- [设计文档](docs/design.md)
- [开发文档](docs/development.md)

## 资源约定

- 建筑模型存放在 `glbfile/`，文件名格式为 `{slug}.glb`
- 建筑详情页路径为 `/models/{slug}`，例如 `/models/yuanxiangtang`
- 园林总平面图为 `glbfile/location.png`
- 音频旁白存放在 `public/audio/`
- 建筑内容配置位于 `config/site-model-content.json`，按 `{slug}` 分组
- 建筑地图位置配置位于 `lib/site-models.ts`
