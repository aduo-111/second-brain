/**
 * 图片去留的「程序确定性执行层」。
 *
 * 架构：AI 只做语义分类（approve / modify / negate / extend / uncertain），
 * 本模块按用户确认的四条规则，用纯程序逻辑算出每张图最终 keep/drop——
 * 不调用任何模型，完全确定、可复现。
 *
 * 规则（优先级从高到低）：
 *   R5  任一 relation = approve（高置信 + 证据为原文）→ 锁定保留（认可过的基础版）
 *   R2a relation = negate（高置信 + 证据为原文强否定）→ 排除（即使无同链替代）
 *   R2b relation = modify 且存在同链替代图 → 排除旧图
 *   R1  任一 relation = extend（高置信 + 证据为原文）→ 保留（基于当前图延伸）
 *   R3  relation = modify 但无同链替代 → uncertain → 默认保留
 *   R4  其余（uncertain / 低置信 / 证据不通过）→ 默认保留
 *   参考图（用户上传）→ 排除
 *
 * 注意：否定/修正（negate/modify）优先于延伸（extend）——先被要求修正的图，
 * 不会因为后来又被引用/延伸而保留；只有「明确认可」(approve) 才会锁定保留。
 *
 * 置信度阈值：低于 0.8 一律先转 uncertain（不做删除依据）。
 * 证据要求：evidence 必须是某条用户反馈原文的连续子串（程序校验）。
 */

/** 高置信阈值：低于此值视为 uncertain。 */
export const CONFIDENCE_THRESHOLD = 0.8;

/**
 * 校验 evidence 是否为某条用户反馈原文的连续子串（防模型概括/编造）。
 * @param {string} evidence
 * @param {string[]} feedbackTexts - 该图相关的用户反馈原文列表（按时间顺序）
 */
export function isVerbatimEvidence(evidence, feedbackTexts) {
	const ev = String(evidence || "").trim();
	if (!ev) return false;
	return (feedbackTexts || []).some((t) => String(t || "").includes(ev));
}

/**
 * 确定性计算「同修改链且更靠后的图」= 该图的替代版本。
 * 新口味 / 延伸设计 / 其他任务（不同 lineageId）不算替代。
 * @param {Array<{imageId:string, msgOrder:number, lineageId:string}>} images
 * @returns {Map<string, string[]>} imageId -> 同链更靠后的 imageId 列表
 */
export function computeReplacementMap(images) {
	const byLineage = new Map();
	for (const img of images || []) {
		if (!img || typeof img.lineageId !== "string") continue;
		if (!byLineage.has(img.lineageId)) byLineage.set(img.lineageId, []);
		byLineage.get(img.lineageId).push(img);
	}
	const map = new Map();
	for (const list of byLineage.values()) {
		list.sort((a, b) => Number(a.msgOrder) - Number(b.msgOrder));
		for (let i = 0; i < list.length; i++) {
			map.set(list[i].imageId, list.slice(i + 1).map((x) => x.imageId));
		}
	}
	return map;
}

/**
 * 确定性执行四条规则。
 * @param {Array<{
 *   imageId:string,
 *   isReference?:boolean,
 *   relations?:Array<{relation:string, evidence:string, confidence:number}>,
 *   feedbackTexts?:string[],
 *   replacementImageIds?:string[]
 * }>} inputs
 * @returns {Array<{imageId:string, keep:boolean, reason:string}>}
 */
export function applyKeepDropRules(inputs) {
	const out = [];
	for (const it of inputs || []) {
		const id = it.imageId;
		if (it.isReference) {
			out.push({ imageId: id, keep: false, reason: "参考图" });
			continue;
		}
		// 预处理：低置信 / 证据非原文 → 一律转 uncertain
		const rels = (it.relations || []).map((r) => {
			const confOk = Number(r.confidence) >= CONFIDENCE_THRESHOLD;
			const evOk = isVerbatimEvidence(r.evidence, it.feedbackTexts);
			if (!confOk || !evOk) return { relation: "uncertain", evidence: "", confidence: 0 };
			return { relation: String(r.relation || "uncertain"), evidence: String(r.evidence || "").trim(), confidence: Number(r.confidence) };
		});
		const has = (rel) => rels.some((r) => r.relation === rel);

		// R5 明确认可过 → 锁定保留（即使之后被修改/否定）
		if (has("approve")) { out.push({ imageId: id, keep: true, reason: "R5 认可基础版锁定" }); continue; }
		// R2a 高置信强否定 → 排除（即使无同链替代）；优先于延伸
		if (has("negate")) { out.push({ imageId: id, keep: false, reason: "R2a 强否定" }); continue; }
		// R2b 修改 + 同链替代 → 排除旧图；优先于延伸
		const hasReplacement = Array.isArray(it.replacementImageIds) && it.replacementImageIds.length > 0;
		if (has("modify") && hasReplacement) { out.push({ imageId: id, keep: false, reason: "R2b 修改+同链替代" }); continue; }
		// R1 基于当前图延伸 → 保留
		if (has("extend")) { out.push({ imageId: id, keep: true, reason: "R1 认可/延伸" }); continue; }
		// R3 修改但无同链替代 → 保留
		if (has("modify")) { out.push({ imageId: id, keep: true, reason: "R3 修改无同链替代→保留" }); continue; }
		// R4 不确定 → 保留
		out.push({ imageId: id, keep: true, reason: "R4 不确定→保留" });
	}
	return out;
}
