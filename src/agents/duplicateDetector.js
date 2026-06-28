import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { callGeminiText, logAgent } from '../utils/gemini';

export const checkDuplicate = async (newIssue, issueId) => {
  const startTime = Date.now();
  try {
    const { lat, lng } = newIssue.location || {};
    if (!lat || !lng) {
      await logAgent({ issueId, agentName: 'duplicate_detector',
        input: newIssue, output: { isDuplicate: false },
        processingTimeMs: Date.now() - startTime, success: true });
      return { isDuplicate: false, existingIssueId: null };
    }

    const snap = await getDocs(
      query(collection(db, 'issues'),
        where('status', 'in', ['Reported', 'Verified', 'In Progress']),
        where('issueType', '==', newIssue.issueType)
      )
    );

    const nearby = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(i => i.location &&
        Math.abs(i.location.lat - lat) < 0.002 &&
        Math.abs(i.location.lng - lng) < 0.002 &&
        i.id !== issueId
      );

    if (nearby.length === 0) {
      await logAgent({ issueId, agentName: 'duplicate_detector',
        input: newIssue, output: { isDuplicate: false },
        processingTimeMs: Date.now() - startTime, success: true });
      return { isDuplicate: false, existingIssueId: null };
    }

    const prompt = `Are these two civic issue reports describing the same problem?

Report A (new): "${newIssue.description}"
Report B (existing): "${nearby[0].description}"
Both are: ${newIssue.issueType} in the same area.

Return ONLY valid JSON:
{
  "isDuplicate": true,
  "similarity": 85,
  "reasoning": "one sentence explanation"
}`;

    const result = await callGeminiText(prompt);
    const output = {
      isDuplicate: result.isDuplicate && result.similarity > 65,
      existingIssueId: result.isDuplicate ? nearby[0].id : null,
      similarity: result.similarity,
    };

    await logAgent({ issueId, agentName: 'duplicate_detector',
      input: newIssue, output,
      processingTimeMs: Date.now() - startTime, success: true });
    return output;
  } catch (err) {
    await logAgent({ issueId, agentName: 'duplicate_detector',
      input: newIssue, output: null,
      processingTimeMs: Date.now() - startTime,
      success: false, error: err.message });
    return { isDuplicate: false, existingIssueId: null };
  }
};
