-- ============================================================
-- M6-1c：小木云端音色配置（用户自带 Key）
-- 作用：让用户把「语音密钥」加密存到账号里，换设备也能继续用云端音色。
--
-- 🔴 产品原则：本站只提供**免费**的语音；付费的一律用户自带 Key。
--    ⇒ 本表**只存用户自己的密钥**，站点不持有任何 TTS Key，也不产生第三方费用。
--
-- 执行：请在 Supabase 后台 → SQL Editor 里整段执行（幂等，可重复跑）。
--
-- 安全设计（与 xiaomu_model_config 完全一致，别改）：
--   1) 启用 RLS 且**不设任何 policy** —— 前端不可直连；仅 Edge 函数用 service_role 读写。
--   2) key_cipher 存**密文**（AES-GCM，见 _shared/crypto.js），明文永不落库；
--      key_mask 是写入时算好的掩码，读取路径只回掩码、不碰密文、不解密。
--   3) 密文以 user_identifier 作为 AAD 绑定 —— 密文被搬到别人行里会解密失败。
--
-- 前置：Edge Secret `KEY_ENC_SECRET` 必须已配置（与 M5 共用同一个），否则：
--       voice.keySet / audio.tts 返回 503 feature_disabled，
--       站点其余功能（含「只存本机」的云端音色）**完全不受影响**。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.xiaomu_voice_config (
  user_identifier   text PRIMARY KEY,
  base_url          text NOT NULL,                    -- 兼容 OpenAI /audio/speech 的端点；写入前过 netguard（https / 仅443 / 拒内网）
  model             text NOT NULL,                    -- 默认 glm-tts
  voice             text NOT NULL,                    -- 默认 tongtong；自定义供应商可自由填写
  key_cipher        text NOT NULL,                    -- AES-GCM 密文（base64: iv‖ct‖tag），AAD 绑 user_identifier
  key_mask          text,                             -- 形如 'sk-abcd...wxyz (len=51)'，仅供前端回显
  enabled           boolean NOT NULL DEFAULT true,    -- 关掉即拒绝服务（配置保留）
  kind_at_creation  text,                             -- 'github' | 'guest'（D6 门槛留痕，便于日后批量清理）
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS：默认无 policy = 对 anon / authenticated 全部拒绝；仅 service_role 可读写
ALTER TABLE public.xiaomu_voice_config ENABLE ROW LEVEL SECURITY;

-- 提示：本表**不需要**（也不应）建任何 anon / authenticated 的 policy。
--       若你之前在别的表上建过放开策略，别照抄到这里。

-- ============================================================
-- 上线检查单（部署时照做）
--   1) 本文件整段执行
--   2) 确认 Edge Secrets 里已有 KEY_ENC_SECRET（M5 阶段应已配，不必重复配）
--   3) 重新部署 content 函数（本批 **只改 content**，_shared/ 未动 ⇒ companion 不用动）
--   4) 验收：POST content { action:'voice.keyGet' } 返回 200 且 exists:false
--   未配 KEY_ENC_SECRET 时：voice.* / audio.tts 返回「功能未启用」，本站其余功能不受影响。
-- ============================================================
