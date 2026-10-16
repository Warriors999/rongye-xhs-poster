export function parseModelJson(text: string): unknown {
  let answer = text.trim().replace(/^\uFEFF/, '');
  // Some compatible gateways put reasoning in content rather than reasoning_content.
  // Only discard closed blocks at the start; never alter strings inside JSON.
  while (/^<think>/i.test(answer)) {
    const end = answer.toLowerCase().indexOf('</think>');
    if (end < 0) throw new SyntaxError('Unfinished model thinking block');
    answer = answer.slice(end + '</think>'.length).trim();
  }
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\s*```$/i.exec(answer);
  return JSON.parse(fenced ? fenced[1] : answer);
}
