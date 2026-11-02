# 今日食签

## 内置插画的 CloudBase 存储

内置食谱图片不放入代码包。创建 CloudBase 环境后，在 `config/cloudbase.js` 中填写环境 ID；小程序优先按需读取可靠的来源成品图，其次读取 `recipe-covers/r001.png` 这类云端插画，并在未配置或网络失败时回退到本地轻量插画。

生成待上传图片（只写系统临时目录，不会扩大代码包）：

```bash
node scripts/generate-recipe-covers.js
```

已存在的 `r001.png` 等封面仍可从 CloudBase 云存储读取；没有对应云端封面的新增菜谱自动使用本地分类插画。用户自建菜谱默认仍只保存在本机；只有主动点击“提交公开审核”时，菜谱、昵称副本和所选封面才会上传 CloudBase。

原生微信小程序，提供 350 余道带公开来源和具体步骤的菜谱，覆盖家常菜、主食、饮品和甜品等类型，并提供成人 BMI、6–17 岁超重肥胖筛查、单胎妊娠期增重参考、一般食养方向、过敏忌口过滤和分类随机抽取。健康数据只保存在微信本地；菜谱仅在用户主动投稿时上传审核。

内置做法来源于 [Anduin2017/HowToCook](https://github.com/Anduin2017/HowToCook)，按 Unlicense 使用。`features/data/verified-recipes.js` 是由 `scripts/import-howtocook-recipes.js` 生成的发布数据；完整做法位于详情分包，主包只加载 `data/recipe-index.js` 中的搜索与推荐摘要。校验脚本会拒绝无来源、无许可标记或仍含万能模板话术的菜谱。

另外收录带逐条来源的网页菜谱，授权和改编说明见 [第三方内容说明](THIRD_PARTY_NOTICES.md)。2026-11-02 从 Wikibooks Cookbook 增补15道，内置总数389道，覆盖早餐、凉菜、主食、汤羹、甜品和饮品。新增内容保留来源版本与 CC BY-SA 4.0 许可；未核算热量、不进入 BMI 推荐，封面使用已有本地分类插画。完整数据仍位于详情分包，不改变本地个人数据或增加远程部署依赖。

来源菜谱“操作”章节中的图片会转换为步骤图映射。能依据原文位置确定步骤的图片显示在对应步骤下方；原文统一放在文末、无法准确对应单一步骤的图片显示为“来源步骤参考图”。图片存放在 CloudBase 的 `recipe-steps/` 目录，不进入小程序主包。重新同步时依次运行：

```bash
node scripts/import-howtocook-recipes.js /path/to/HowToCook
node scripts/download-step-images.js /tmp/today-eat-step-images
tcb -e cloud1-d8gd0cz7te6173bb3 storage upload /tmp/today-eat-step-images/recipe-steps recipe-steps --times 3
```

来源菜谱中能明确识别为成品或预览的图片，会作为首页、列表和详情页封面，存放在 CloudBase 的 `recipe-source-covers/` 目录；无法确认是否为成品图的菜谱继续使用原有插画。同步命令：

```bash
node scripts/download-source-covers.js /tmp/today-eat-source-covers
tcb -e cloud1-d8gd0cz7te6173bb3 storage upload /tmp/today-eat-source-covers/recipe-source-covers recipe-source-covers --times 3
```

内置菜谱支持直接修改：用户可在详情页替换封面、编辑食材与步骤，修改会在首页、搜索、推荐和抽取中立即生效，但不会出现在“我的菜谱”列表；可随时恢复内置原版。

## 营养与采购清单

- 菜谱详情会根据食材用量计算每份热量、蛋白质、碳水、脂肪、膳食纤维，以及钠、钾、钙、铁、维生素 A/C/E 和叶酸，并同时展示宏量及微量数据覆盖率。
- 营养基础值首批参考 USDA FoodData Central 公共领域（CC0）数据；中国食物成分查询平台仅作为产品调研来源，未复制其受版权保护的数据。
- `scripts/build-usda-nutrition.js` 可从 USDA Foundation Foods 与 SR Legacy 官方 JSON 重新生成 `features/data/food-micros.js`，当前覆盖 99 种标准食材。
- 烹饪后微量营养采用 USDA《Table of Nutrient Retention Factors, Release 6》整理的家庭烹饪方式通用保留率；系统会从菜名和步骤识别凉拌、蒸、煮、汤羹、炒、煎炸或烘烤。该修正仍是估算，不代表实验室检测。
- 今日计划页保留菜单安排和采购清单，不提供采购价格、预算生成或平台比价。
- 采购清单会按常见整包规格或散称起购步进，显示需求量、建议购买包数和预计余量。
- 品牌差异、食材可食部和实际包装会造成误差，采购数量仅作为准备提示。

## 社区菜谱投稿与审核

- 编辑页提供“仅保存本机”和“提交公开审核”两个独立操作。
- 投稿由 `recipeCommunity` 云函数写入 `recipe_submissions`；管理员审核通过后发布至 `public_recipes`，并递增 `recipe_meta/public-recipes` 的版本号。
- 首页下拉会拉取最新公共菜谱并缓存到本机；网络不可用时继续使用上次缓存。
- “我的 → 通知与菜谱投稿”显示个人审核结果；管理员账号还会显示待审核队列。
- 用户可以撤回投稿；已发布菜谱也可主动下架并删除云端投稿和封面。
- 管理员 OpenID 通过云函数环境变量 `ADMIN_OPENIDS` 配置，多个值使用英文逗号分隔；不要写入客户端代码或公开仓库。

部署云函数：

```bash
tcb -e cloud1-d8gd0cz7te6173bb3 fn deploy recipeCommunity --force --install-dependency true
```

数据库集合 `recipe_submissions`、`public_recipes`、`recipe_meta` 应设置为客户端不可直接读写，所有操作统一经过云函数完成。

不要直接把整个云存储环境改成公有读：`community-recipe-covers/` 中可能包含仍在审核的投稿封面。若后续要给内置图片配置永久公开地址，应仅对 `recipe-covers/`、`recipe-source-covers/` 和 `recipe-steps/` 设置路径级读取规则，并继续限制社区投稿目录。

## 管理员调整菜系与餐食分类

- 管理员入口：“我的 → 菜系与餐食分类管理”，或“通知与菜谱投稿 → 管理菜系与餐食分类”。沿用 `ADMIN_OPENIDS` 权限，云函数会再次校验身份。
- 菜系、餐食分类支持新增、改名、上下排序、合并与删除；每组至少保留一个分类。删除有菜谱的分类时必须选择接收分类，空分类删除也需确认，均不会删除菜谱内容。
- “菜谱归类”支持搜索、筛选和分页，管理员可修改单道内置或公共投稿菜谱的菜系及餐食分类；个人自建菜谱及本机私有修改不接受单菜覆盖。
- 分类配置保存在已有的 `recipe_meta/recipe-catalog` 文档，不新增数据库集合。用户首页下拉同步会同时获取分类，即使公共菜谱正文没有更新也能同步分类变更，并支持离线读取缓存。
- 首页分类、新建菜谱选项及详情页归类使用同一份配置；分类改名保留原有搭配角色，避免将显示名称变更误当作营养属性变化。
- 多位管理员同时编辑时使用版本校验，冲突会提示刷新；请先部署新版 `recipeCommunity`，再编译使用管理入口。
- 新增或修改内置菜谱后运行 `node scripts/build-recipe-index.js`，会一起更新云函数内置菜谱索引及前后端共享分类规则；`--check` 检查三份生成文件是否过期。

## 本地运行

1. 打开微信开发者工具。
2. 导入本目录 `home-recipe-miniapp`。
3. 仓库中的 `project.config.json` 使用 `touristappid`。真机预览或上传前，在不会提交到 Git 的 `project.private.config.json` 中填写自己的 `appid`；开发者工具会优先使用本机私有配置。
4. 内置菜谱封面优先使用 CloudBase 图片，随代码包发布的卡通插画用于断网或加载失败时兜底。
5. 如果为菜谱配置远程视频，需使用有授权的 HTTPS 内容，并配置对应媒体域名。

## 开发检查

```bash
node scripts/validate-recipes.js
node scripts/test-core.js
node scripts/test-optimizations.js
node scripts/test-web-recipes.js
node scripts/test-local-reliability.js
node scripts/build-recipe-index.js --check
node scripts/check-package-layout.js
node scripts/check-cloud-image-inventory.js
```

`validate-recipes.js` 会校验内置菜谱的 ID、类型、标签、抽取池、过敏原、卡通封面映射和步骤。`test-core.js` 覆盖 BMI 边界、推荐、图片过期重取、社区云封面、忌口过滤、同日体重覆盖和本地存储。

本地草稿、个人备份、图片空间管理、收藏筛选及时间戳计时说明见 [可靠性与交互优化记录](scripts/RELIABILITY-UX.md)。备份入口在“我的 → 个人备份与图片空间”；文件含未加密个人信息，不含社区缓存及草稿，需主动导出到小程序之外保管。备份和图片优化仅在详情分包加载，不新增数据库服务。

`check-cloud-image-inventory.js` 默认检查代码、步骤图清单和成品图清单是否一致。需要核对云存储实物时，从 CloudBase 控制台或 CLI 导出文件路径清单后运行：

```bash
node scripts/check-cloud-image-inventory.js --inventory /path/to/storage-files.json
```

修改内置菜谱后运行 `node scripts/build-recipe-index.js` 更新主包摘要，`--check` 会检测摘要是否过期；导入 HowToCook 时会自动重新生成。

## 2026-11 性能与可靠性优化

- 发布、审核和下架使用数据库事务，同步版本不再通过独立读写递增；旧客户端缓存会先全量校准，删除历史过期后也会退回全量同步。
- 分页同步期间版本发生变化时重新开始，同一客户端复用进行中的同步任务。
- 社区菜谱与其版本保存在同一个本地缓存快照，保存失败会提示重试，不会将空缓存标为最新。
- 封面通过 `prepareCover` 取得一次性上传凭证；只允许绑定和删除当前投稿拥有的图片。复制社区菜谱时会上传独立副本；旧投稿的无凭证图片不会自动删除，避免误删共享图片。
- 套餐按主食、蛋白质和蔬菜等角色选择；没有匹配项时不会用错误分类凑数。
- 首页按数据变化刷新，返回时保留已加载页；首页、收藏和我的菜谱均使用轻量卡片与增量追加。
- 图片初次渲染复用有效云地址，失败冷却 30 秒，换取地址时每批不超过 50 个文件。
- 完整步骤、食材用量和处理文案移入 `features` 分包，并保留本地离线内容。

发布顺序：先部署新版 `recipeCommunity` 云函数，再用开发者工具编译、真机验证并发布新版小程序。仍使用已有三个数据库集合；上传凭证存放在 `recipe_meta`，客户端不可直接读写。旧版客户端携带未校验云封面的投稿会被拒绝，需更新小程序后重新提交。详见 [优化验证与发布检查](scripts/OPTIMIZATION.md)。

## 数据边界

- 头像、身高、体重历史、忌口、本地菜谱和抽取历史默认只保存在当前设备。
- 只有用户主动投稿时，菜谱、昵称副本、所选封面和公开教程链接才会上传 CloudBase；用户可以撤回或下架删除。
- 清理微信缓存、删除小程序数据或更换设备后，本地数据可能无法找回。
- 成人 BMI、儿童超重肥胖界值和孕期增重范围仅用于筛查或健康教育，不构成医学诊断、治疗或个体化营养处方。选择疾病相关状况后会暂停自动健康配餐。
- 内置菜谱优先读取本项目 CloudBase 中的成品图或插画，失败时回退到代码包内的分类插画；昵称、健康记录和过敏信息不会随图片请求上传。
- 首页横幅 `assets/home-hero.jpg` 是为本项目生成的摄影风视觉素材，不作为任何具体菜谱或营养信息的实拍依据。
