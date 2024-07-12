terms_map = {}
terms = {}

-- Adds anchor links to headings with IDs.
function Header(el)
  if el.level == 2 and el.identifier ~= '' then
    -- an empty link to this header
    local anchor_link = pandoc.Link(
      {'⋄'},                -- content
      '#' .. el.identifier,  -- href
      '',                   -- title
      {class = 'anchor-link', ['aria-hidden'] = 'true'} -- attributes
    )
    el.content:insert(1, anchor_link)
    return el
  end
end

function Span(el)
  if el.attributes.x ~= nil then
    local itype = el.attributes.x;
    local text = pandoc.text.lower(pandoc.utils.stringify(el.content))
    local id = itype .. '-' .. string.gsub(text, ' ', '-')
    if terms[itype] == nil then
      terms[itype], terms_map[itype] = {}, {}
    end
    table.insert(terms[itype], id)
    terms_map[itype][id] = el.content
    return pandoc.Span(pandoc.Emph(el.content), { id = id })
  end
end

function Div(el)
  if el.attributes.index_of ~= nil then
    local itype = el.attributes.index_of
    table.sort(terms[itype])
    local contents = {}
    for _, id in ipairs(terms[itype]) do
      local content = terms_map[itype][id]
      table.insert(contents, pandoc.Link(content, '#' .. id))
    end
    return pandoc.BulletList(contents, { class = 'terms-list' })
  end
end

function CodeBlock(el)
  if el.classes[1] == "emulator" then
    return pandoc.Div(pandoc.RawInline('html', el.text), {
      class = "emulator-disabled"
    })
  end
end
