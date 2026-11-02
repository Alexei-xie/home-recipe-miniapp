# 第三方内容说明

## HowToCook

- 项目：Anduin2017/HowToCook
- 地址：https://github.com/Anduin2017/HowToCook
- 用途：内置菜谱的原料、用量、操作步骤与烹饪提示
- 许可：Unlicense
- 许可原文：https://github.com/Anduin2017/HowToCook/blob/master/LICENSE

本项目使用导入脚本将公开 Markdown 菜谱转换为微信小程序所需的结构化数据。每道菜在详情数据中保留对应原始页面链接；导入时仅进行结构转换、错别字修正、同名去重和展示字段补充。

## Wikibooks Cookbook

- 项目：Wikibooks Cookbook
- 地址：https://en.wikibooks.org/wiki/Cookbook:Recipes
- 用途：首批非 GitHub 开放菜谱的配料、操作顺序与烹饪提示
- 许可：Creative Commons Attribution-ShareAlike 4.0
- 许可原文：https://creativecommons.org/licenses/by-sa/4.0/

项目将相关英文菜谱翻译为中文，并按家庭厨房常用单位、安全提示和小程序数据结构进行改编。每道菜在详情数据中保留对应 Wikibooks 页面链接；相关改编内容按相同许可提供。

### 2026-11-02 网页增补批次

新增 15 道，ID 为 `w013`–`w027`，数据文件为 `features/data/web-recipes-202611.js`。已逐页阅读来源的食材与操作流程，并与现有菜名去重；这不代表厨房实测或专业营养审核。来源作者为各页面历史中的 Wikibooks Cookbook 社区贡献者，以下页面链接同时提供署名入口。每条数据额外保留所核对页面的 `referenceRevisionUrl`，便于回溯采集时版本。

| 菜名 | 来源页面 | 核对版本 oldid |
| --- | --- | --- |
| 法式吐司 | [French Toast](https://en.wikibooks.org/wiki/Cookbook:French_Toast) | 4655023 |
| 希腊沙拉 | [Greek Salad](https://en.wikibooks.org/wiki/Cookbook:Greek_Salad) | 4518144 |
| 奶香土豆泥 | [Mashed Potatoes](https://en.wikibooks.org/wiki/Cookbook:Mashed_Potatoes) | 4669243 |
| 黄瓜酸奶酱 | [Tzatziki](https://en.wikibooks.org/wiki/Cookbook:Tzatziki) | 4519035 |
| 法式可丽饼 | [Crêpes I](https://en.wikibooks.org/wiki/Cookbook:Cr%C3%AApes_I) | 4535129 |
| 香蕉面包蛋糕 | [Banana Bread I](https://en.wikibooks.org/wiki/Cookbook:Banana_Bread_I) | 4658357 |
| 热可可牛奶 | [Hot Chocolate](https://en.wikibooks.org/wiki/Cookbook:Hot_Chocolate) | 4524021 |
| 西班牙土豆蛋饼 | [Tortilla Española](https://en.wikibooks.org/wiki/Cookbook:Tortilla_Espa%C3%B1ola) | 4517812 |
| 南瓜鹰嘴豆汤 | [Pumpkin Soup](https://en.wikibooks.org/wiki/Cookbook:Pumpkin_Soup) | 4584563 |
| 番茄罗勒烤面包 | [Bruschetta](https://en.wikibooks.org/wiki/Cookbook:Bruschetta) | 4523487 |
| 香蕉松饼 | [Banana Pancakes](https://en.wikibooks.org/wiki/Cookbook:Banana_Pancakes) | 4523328 |
| 豆蔻牛奶米布丁 | [Kheer](https://en.wikibooks.org/wiki/Cookbook:Kheer_(Rice_Pudding)) | 4587270 |
| 芒果酸奶拉西 | [Sweet Mango Lassi](https://en.wikibooks.org/wiki/Cookbook:Sweet_Mango_Lassi) | 4511034 |
| 鸡丝豆腐酸辣汤 | [Hot and Sour Soup](https://en.wikibooks.org/wiki/Cookbook:Hot_and_Sour_Soup) | 4518420 |
| 芝麻油蔬菜凉意面 | [Sesame Noodle Salad](https://en.wikibooks.org/wiki/Cookbook:Sesame_Noodle_Salad) | 4518097 |

改编内容（上述中文食材、描述、步骤、提示）按 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 提供，不改变其他代码或内容的许可。土豆泥来源页还注明使用 Henry Hartshorne 公有领域著作《Household Cyclopedia》，本项目在对应提示中保留此说明。

主要改动：翻译为中文；拆解操作步骤；按家庭厨房补充切配、熟度、冷藏提示；在来源未定量时提供并明确标注参考用量、份数和时间；部分菜谱减少起始加糖、加盐量。量杯体积不擅自等同于重量，干料无可靠换算时保留毫升量杯单位。所有新增菜谱的能量等级为“未评估”，热量为空，`healthEligible` 为 `false`，未经进一步核算不进入 BMI 推荐。

没有下载、转载或热链这些网页的图片、视频；图片有独立许可，不能用网页文字许可替代。封面继续使用应用现有本地插画降级方案，不增加远程资源请求或部署依赖。

## Open Recipe

- 项目：uraplutonium/open-recipe
- 站点：https://uraplutonium.github.io/open-recipe/
- 源码：https://github.com/uraplutonium/open-recipe
- 用途：补充站内缺失菜谱的配料比例、操作顺序与时间参考
- 来源声明：项目自述为任何人都能够分享和改进美食制作方法的食谱

该项目未在仓库中附带标准许可证文件。本项目没有复用其网页模板或图片，仅依据公开页面中的配料、时间和烹饪方法等事实信息重新整理、改写中文步骤，并为每道菜保留原始页面链接。若来源项目后续补充许可证或权利人提出调整要求，应据此更新或移除相关内容。
