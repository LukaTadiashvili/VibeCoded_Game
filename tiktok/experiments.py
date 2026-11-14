"""What we test: every day the pipeline picks one NICHE x STYLE combination.

The least-used combination is chosen first, so after ~2-3 weeks every pair has
been tried at least once. Once you know the winner, set LOCK_NICHE / LOCK_STYLE
below (or the GitHub repo variables of the same name) and every new video will
use it.
"""

NICHES = {
    "business": "ბიზნესი და გაყიდვები: პრაქტიკული რჩევები მეწარმეებისთვის, გაყიდვების ხრიკები, მოლაპარაკება",
    "facts": "საინტერესო ფაქტები: გასაოცარი, ნაკლებად ცნობილი ფაქტები მსოფლიოს, მეცნიერების, ცხოველების შესახებ",
    "georgia": "საქართველო: ისტორიის, კულტურის, ენის, სამზარეულოს საინტერესო და ამაყი ფაქტები",
    "psychology": "ფსიქოლოგია: ადამიანის ქცევის ხრიკები, ტვინის საიდუმლოებები, ურთიერთობები",
    "money": "ფული და ფინანსები: დაზოგვა, ინვესტირება, ფინანსური შეცდომები, რომლებსაც ყველა უშვებს",
    "motivation": "მოტივაცია და თვითგანვითარება: ჩვევები, დისციპლინა, წარმატებული ადამიანების გაკვეთილები",
}

STYLES = {
    "photo": "cinematic photorealistic photo, dramatic lighting, shallow depth of field, vivid colors, vertical composition",
    "illustration": "bold colorful 3D cartoon illustration, Pixar-like, playful, clean background, vertical composition",
    "text": None,  # no AI images: bold animated text on colorful gradients (cheapest, very TikTok-native)
}

VOICES = ["ka-GE-EkaNeural", "ka-GE-GiorgiNeural"]

# Set these when you have a winner, e.g. LOCK_NICHE = "facts"
LOCK_NICHE = None
LOCK_STYLE = None
