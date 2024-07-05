-- Adds anchor links to headings with IDs.
function Header (h)
  if h.level == 2 and h.identifier ~= '' then
    -- an empty link to this header
    local anchor_link = pandoc.Link(
      {'⋄'},                -- content
      '#' .. h.identifier,  -- href
      '',                   -- title
      {class = 'anchor-link', ['aria-hidden'] = 'true'} -- attributes
    )
    h.content:insert(1, anchor_link)
    return h
  end
end
