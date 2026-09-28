-- ============================================================
-- M5：小木自定义模型配置（用户自带 Key / 自建 endpoint）
-- 作用：让每个用户在设置面板里配置自己的 LLM 平台、模型与 API Key，
--       之后与小木的对话就走他自己的模型。
-- 执行：请在 Supabase 后台 → SQL Editor 里整段执行（幂等，可重复跑）。
--
-- 安全设计（三条，别改）：
--   1) 启用 RLS 且**不设任何 policy** —— 前端不可直连；
--      仅 content / companion 函数用 service_role（绕过 RLS）读写。
--   2) key_cipher 存**密文**（AES-GCM，见 _shared/crypto.js），明文永不落库；
--      key_mask 是写入时算好的掩码，读取路径只回掩码、不碰密文、不解密。
--   3) 密文以 user_identifier 作为 AAD 绑定 —— 密文被搬到别人行里会解密失败。
--
-- 前置：Edge Secret `KEY_ENC_SECRET` 必须已配置，否则本表功能整体关闭
--       （配置缺失 → 功能静默停用，站点行为与 M4 完全一致，可安全先上代码后配密钥）。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.xiaomu_model_config (
  user_identifier   text PRIMARY KEY,
  provider          text NOT NULL,                       -- 'zhipu' | 'deepseek' | 'openai' | 'ollama' | 'custom'
  base_url          text,                                 -- 仅 ollama / custom 填写（须过 netguard 校验）
  model             text NOT NULL,
  key_cipher        text,                                 -- AES-GCM 密文（base64: iv‖ct‖tag）；ollama 本地可空
  key_mask          text,                                 -- 形如 'sk-abcd...wxyz (len=51)'，仅供前端回显
  enabled           boolean NOT NULL DEFAULT true,        -- 关掉即回落站点默认（配置保留）
  kind_at_creation  text,                                 -- 'github' | 'guest'（D6 收紧留痕，便于日后批量清理）
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS：默认无 policy = 对 anon / authenticated 全部拒绝；仅 service_role 可读写
ALTER TABLE public.xiaomu_model_config ENABLE ROW LEVEL SECURITY;

-- 提示：本表**不需要**（也不应）建任何 anon / authenticated 的 policy。
--       若你之前建过针对本表的放开策略，请删除。

-- ============================================================
-- 上线检查单（部署时照做）
--   1) 本文件整段执行
--   2) Dashboard → Edge Functions → Secrets 新增 KEY_ENC_SECRET（32+ 随机字符）
--   3) 粘贴 _shared/crypto.js 与 _shared/netguard.js
--   4) 重新部署 content 与 companion（_shared/* 是 import 依赖，必须整包重部署）
--   未配 KEY_ENC_SECRET 时：model.* 接口返回「功能未启用」，对话不受影响。
-- ============================================================
