const html = '<p><span style="background-color: transparent; color: rgb(0, 0, 0);">제자리에서&nbsp;**압축(Compression)과 이완(Rarefaction)**을&nbsp;반복하며 에너지안을 전달하는 종파 형태를 띕니다.</span></p>';

function markdownToHtml(text) {
  if (!text) return ''
  let html = text
  const segments = html.split(/(<[^>]+>)/g)
  
  const processedSegments = segments.map((seg, i) => {
    if (seg.startsWith('<') && seg.endsWith('>')) return seg
    
    let s = seg
    s = s.replace(/&nbsp;/g, ' ')
    
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    s = s.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
    return s
  })
  
  return processedSegments.join('')
}

console.log(markdownToHtml(html))
