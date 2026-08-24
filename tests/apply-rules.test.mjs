/**
 * 离线单元测试：程序确定性执行层（lib/judge.js）。
 * 不调用任何模型、不联网：使用固定输入验证规则完全确定。
 * 运行：node tests/apply-rules.test.mjs
 */
import { strict as assert } from "node:assert";
import {
	applyKeepDropRules,
	computeReplacementMap,
	isVerbatimEvidence
} from "../dsh-client-ui-second-brain/lib/judge.js";

const cases = [];
function t(name, fn) { cases.push([name, fn]); }
const R = (relation, evidence, confidence) => ({ relation, evidence, confidence });

t("R5: approve 高置信+原文证据 → 锁定保留", () => {
	const out = applyKeepDropRules([{ imageId: "a", relations: [R("approve", "这个好", 0.9)], feedbackTexts: ["这个好！就用这个"], replacementImageIds: [] }]);
	assert.equal(out[0].keep, true);
	assert.match(out[0].reason, /R5/);
});

t("R1: extend 高置信+原文证据 → 保留（即使有同链更靠后的图）", () => {
	const out = applyKeepDropRules([{ imageId: "a", relations: [R("extend", "再做一个草莓味的", 0.9)], feedbackTexts: ["可以，再做一个草莓味的"], replacementImageIds: ["b"] }]);
	assert.equal(out[0].keep, true);
	assert.match(out[0].reason, /R1/);
});

t("R2a: negate 高置信+原文强否定+无替代 → 也排除", () => {
	const out = applyKeepDropRules([{ imageId: "a", relations: [R("negate", "这张不行", 0.9)], feedbackTexts: ["这张不行，重画"], replacementImageIds: [] }]);
	assert.equal(out[0].keep, false);
	assert.match(out[0].reason, /R2a/);
});

t("R2b: modify + 同链替代 → 排除旧图", () => {
	const out = applyKeepDropRules([{ imageId: "a", relations: [R("modify", "换个背景", 0.9)], feedbackTexts: ["换个背景再出一版"], replacementImageIds: ["b"] }]);
	assert.equal(out[0].keep, false);
	assert.match(out[0].reason, /R2b/);
});

t("R3: modify 但无同链替代 → uncertain → 保留", () => {
	const out = applyKeepDropRules([{ imageId: "a", relations: [R("modify", "换个背景", 0.9)], feedbackTexts: ["换个背景"], replacementImageIds: [] }]);
	assert.equal(out[0].keep, true);
	assert.match(out[0].reason, /R3/);
});

t("R4: 纯 uncertain → 保留", () => {
	const out = applyKeepDropRules([{ imageId: "a", relations: [R("uncertain", "", 0)], feedbackTexts: [] }]);
	assert.equal(out[0].keep, true);
	assert.match(out[0].reason, /R4/);
});

t("低置信 negate(0.6) → 转 uncertain → 保留", () => {
	const out = applyKeepDropRules([{ imageId: "a", relations: [R("negate", "这张不行", 0.6)], feedbackTexts: ["这张不行"], replacementImageIds: ["b"] }]);
	assert.equal(out[0].keep, true);
	assert.match(out[0].reason, /R4/);
});

t("置信恰为 0.8 → 通过阈值", () => {
	const out = applyKeepDropRules([{ imageId: "a", relations: [R("negate", "这张不行", 0.8)], feedbackTexts: ["这张不行"] }]);
	assert.equal(out[0].keep, false);
});

t("证据非原文（模型概括）→ 转 uncertain → 保留", () => {
	const out = applyKeepDropRules([{ imageId: "a", relations: [R("negate", "用户表示不喜欢这张图", 0.95)], feedbackTexts: ["这张不行，重画"], replacementImageIds: ["b"] }]);
	assert.equal(out[0].keep, true);
	assert.match(out[0].reason, /R4/);
});

t("R5 优先：先认可、后修改+替代 → 锁定保留", () => {
	const out = applyKeepDropRules([{ imageId: "a", relations: [R("approve", "这个好", 0.9), R("modify", "换个背景", 0.9)], feedbackTexts: ["这个好！", "换个背景"], replacementImageIds: ["b"] }]);
	assert.equal(out[0].keep, true);
	assert.match(out[0].reason, /R5/);
});

t("否定优先于延伸：先被要求修正、后又被延伸 → 排除", () => {
	const out = applyKeepDropRules([{ imageId: "a", relations: [R("negate", "需要和上面的设计保持风格一致", 0.9), R("extend", "再做一个草莓味的", 0.9)], feedbackTexts: ["需要和上面的设计保持风格一致", "再做一个草莓味的"], replacementImageIds: [] }]);
	assert.equal(out[0].keep, false);
	assert.match(out[0].reason, /R2a/);
});

t("修改+同链替代 优先于延伸 → 排除", () => {
	const out = applyKeepDropRules([{ imageId: "a", relations: [R("modify", "换个背景", 0.9), R("extend", "再做一个", 0.9)], feedbackTexts: ["换个背景", "再做一个草莓味的"], replacementImageIds: ["b"] }]);
	assert.equal(out[0].keep, false);
	assert.match(out[0].reason, /R2b/);
});

t("参考图（用户上传）→ 排除", () => {
	const out = applyKeepDropRules([{ imageId: "ref", isReference: true }]);
	assert.equal(out[0].keep, false);
});

t("isVerbatimEvidence：原文子串通过、概括/空不通过", () => {
	assert.equal(isVerbatimEvidence("这个好", ["这个好！就用这个"]), true);
	assert.equal(isVerbatimEvidence("大概是这样", ["这个好！就用这个"]), false);
	assert.equal(isVerbatimEvidence("", ["x"]), false);
});

t("computeReplacementMap：同链靠后=替代，异链（新口味/新任务）不算", () => {
	const map = computeReplacementMap([
		{ imageId: "a", msgOrder: 1, lineageId: "L1" },
		{ imageId: "b", msgOrder: 2, lineageId: "L1" },
		{ imageId: "c", msgOrder: 3, lineageId: "L1" },
		{ imageId: "x", msgOrder: 4, lineageId: "L2" } // 新口味，不同链
	]);
	assert.deepEqual(map.get("a"), ["b", "c"]);
	assert.deepEqual(map.get("b"), ["c"]);
	assert.deepEqual(map.get("c"), []);
	assert.deepEqual(map.get("x"), []);
});

t("脱敏等价（气泡水标准）：延伸基础版保留 / 风格修正排除 / 新口味批次不误删", () => {
	const inputs = [
		// 图2：延伸基础版 → 保留
		{ imageId: "img-2", relations: [R("extend", "再根据这个延伸其他口味", 0.9)], feedbackTexts: ["可以，再根据这个延伸其他口味的设计"], replacementImageIds: ["img-3"] },
		// 图9：风格修正（modify）+ 同链替代 → 排除
		{ imageId: "img-9", relations: [R("modify", "需要和上面的设计保持风格一致", 0.9)], feedbackTexts: ["需要和上面的设计保持风格一致"], replacementImageIds: ["img-10"] },
		// 图3/图8：新口味任务批次（不同链 → 无替代）→ 保留
		{ imageId: "img-3", relations: [R("uncertain", "", 0)], feedbackTexts: ["做葡萄味的"], replacementImageIds: [] },
		{ imageId: "img-8", relations: [R("uncertain", "", 0)], feedbackTexts: ["做葡萄味的"], replacementImageIds: [] }
	];
	const out = applyKeepDropRules(inputs);
	const byId = Object.fromEntries(out.map((x) => [x.imageId, x]));
	assert.equal(byId["img-2"].keep, true);
	assert.equal(byId["img-9"].keep, false);
	assert.equal(byId["img-3"].keep, true);
	assert.equal(byId["img-8"].keep, true);
});

// 运行
let failed = 0;
for (const [name, fn] of cases) {
	try {
		fn();
		console.log("PASS  " + name);
	} catch (e) {
		failed++;
		console.log("FAIL  " + name + "\n      " + (e && e.message ? e.message : String(e)));
	}
}
console.log(`\n${cases.length - failed}/${cases.length} 通过`);
process.exit(failed ? 1 : 0);
