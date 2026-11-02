# 2026-11-02 优化记录

已从 GitHub main 执行 fast-forward 拉取，基线为 `6ed7285`。

## 已实现顺序

1. 社区同步一致性：发布、审核状态、删除和版本在事务中变更；分页版本不一致时重试；旧缓存、删除历史超期时全量校准。
2. 缓存可靠性：社区菜谱与版本原子保存；旧版缓存无损迁移并重新同步；存储失败向调用者返回明确错误。
3. 封面归属：服务端签发上传凭证、单次绑定投稿、独立副本、校验后清理失败投稿图片；旧无凭证图片保留，避免越权删除。
4. 套餐分类：为内置摘要生成搭配角色，自定义菜谱按食材识别，调味料不充当蛋白质，不用肉菜填补蔬菜位置。
5. 页面与图片：按数据变化刷新首页、保留加载进度、卡片分页与增量传输、有效图片缓存优先、失败冷却、云地址分批请求。
6. 拆包：完整菜谱数据、步骤处理与详情缓存移入 features；主包使用自动生成摘要；提供摘要漂移和主包依赖检查。

## 自动验证

```sh
node scripts/validate-recipes.js
node scripts/test-core.js
node scripts/test-optimizations.js
node scripts/build-recipe-index.js --check
node scripts/check-package-layout.js --compare-head
node scripts/check-cloud-image-inventory.js
git diff --check
```

优化回归使用隔离的本地存储、乐观并发事务及页面 setData 模拟，不访问生产数据库。覆盖并发发布、审核重入、事务回滚、分页重启、重复同步合并、缓存写失败重启、损坏/旧缓存恢复、封面跨用户访问和凭证重放、30 天午餐分类、图片失败冷却和批次上限、列表返回与增量更新。

数据库事务接口参考：[CloudBase 事务操作](https://docs.cloudbase.net/database/transaction)、[微信官方 wx-server-sdk 类型定义](https://github.com/wechat-miniprogram/wx-server-sdk/blob/master/index.d.ts)。

## 发布前仍需执行

- 在当前 CloudBase 环境部署新版 recipeCommunity；保持 ADMIN_OPENIDS 配置，三个集合仍禁止客户端直读写。
- 使用两个客户端验证同步与下架，验证真实数据库事务行为和封面上传权限。现有静态图片路径不变，无需重新上传内置图。
- 先上线云函数再发布客户端，新版封面投稿依赖 prepareCover/discardCover 操作。旧版带封面投稿应引导更新；旧无凭证封面不会自动清理。
- 真机确认返回首页保留浏览位置、忌口修改即时生效、收藏翻页、图片失败兜底、详情/编辑/烹饪步骤完整。
- 在开发者工具查看实际主包体积和性能面板；源码字节变化不能当作启动耗时的实测提升。
- 长期未使用的上传凭证可按 createdAt 清理；应只处理无 submissionId 的过期凭证，并在核对目录和引用后清理对应文件。

本轮只进行本地代码与验证，不部署生产云函数、不推送 GitHub。
