# 今日食签

## 内置插画的 CloudBase 存储

内置食谱图片不放入代码包。创建 CloudBase 环境后，在 `config/cloudbase.js` 中填写环境 ID；小程序优先按需读取可靠的来源成品图，其次读取 `recipe-covers/r001.png` 这类云端插画，并在未配置或网络失败时回退到本地轻量插画。

生成待上传图片（只写系统临时目录，不会扩大代码包）：

```bash
node scripts/generate-recipe-covers.js
```

已存在的 `r001.png` 等封面仍可从 CloudBase 云存储读取；没有对应云端封面的新增菜谱自动使用本地分类插画。用户自建菜谱默认仍只保存在本机；只有主动点击“提交公开审核”时，菜谱、昵称副本和所选封面才会上传 CloudBase。

原生微信小程序，提供 350 余道带公开来源和具体步骤的菜谱，覆盖家常菜、主食、饮品和甜品等类型，并提供成人 BMI、6–17 岁超重肥胖筛查、单胎妊娠期增重参考、一般食养方向、过敏忌口过滤和分类随机抽取。健康数据只保存在微信本地；菜谱仅在用户主动投稿时上传审核。

内置做法来源于 [Anduin2017/HowToCook](https://github.com/Anduin2017/HowToCook)，按 Unlicense 使用。`data/verified-recipes.js` 是由 `scripts/import-howtocook-recipes.js` 生成的发布数据；校验脚本会拒绝无来源、无许可标记或仍含万能模板话术的菜谱。

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
- `scripts/build-usda-nutrition.js` 可从 USDA Foundation Foods 与 SR Legacy 官方 JSON 重新生成 `data/food-micros.js`，当前覆盖 99 种标准食材。
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

## 本地运行

1. 打开微信开发者工具。
2. 导入本目录 `home-recipe-miniapp`。
3. 仓库中的 `project.config.json` 使用 `touristappid`。真机预览或上传前，在不会提交到 Git 的 `project.private.config.json` 中填写自己的 `appid`；开发者工具会优先使用本机私有配置。
4. 内置菜谱封面使用随代码包发布的卡通插画，无需配置第三方图片域名。
5. 如果为菜谱配置远程视频，需使用有授权的 HTTPS 内容，并配置对应媒体域名。

## 开发检查

```bash
node scripts/validate-recipes.js
node scripts/test-core.js
node scripts/check-cloud-image-inventory.js
```

`validate-recipes.js` 会校验内置菜谱的 ID、类型、标签、抽取池、过敏原、卡通封面映射和步骤。`test-core.js` 覆盖 BMI 边界、推荐、图片过期重取、社区云封面、忌口过滤、同日体重覆盖和本地存储。

`check-cloud-image-inventory.js` 默认检查代码、步骤图清单和成品图清单是否一致。需要核对云存储实物时，从 CloudBase 控制台或 CLI 导出文件路径清单后运行：

```bash
node scripts/check-cloud-image-inventory.js --inventory /path/to/storage-files.json
```

## 数据边界

- 头像、身高、体重历史、忌口、本地菜谱和抽取历史默认只保存在当前设备。
- 只有用户主动投稿时，菜谱、昵称副本、所选封面和公开教程链接才会上传 CloudBase；用户可以撤回或下架删除。
- 清理微信缓存、删除小程序数据或更换设备后，本地数据可能无法找回。
- 成人 BMI、儿童超重肥胖界值和孕期增重范围仅用于筛查或健康教育，不构成医学诊断、治疗或个体化营养处方。选择疾病相关状况后会暂停自动健康配餐。
- 内置菜谱优先读取本项目 CloudBase 中的成品图或插画，失败时回退到代码包内的分类插画；昵称、健康记录和过敏信息不会随图片请求上传。
- 首页横幅 `assets/home-hero.jpg` 是为本项目生成的摄影风视觉素材，不作为任何具体菜谱或营养信息的实拍依据。
