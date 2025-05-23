export enum PageType {
  Accordion,
  Album,
  Blog,
  Content,
  Dashboard,
  Shop,
  SearchResults
}

/**
see:  ionicblocks.com 

Accordion
The Accordion page contains a list of subpages that can be expanded or collapsed.
Any other page type can be used as a subpage. With Expandable subpages, hierarchical content can be displayed.
Examples:
- FAQs frequently asked questions
- Product features
- Legal information with paragraphs

Album
An Album page shows a gallery of images. It is a routable page that can be navigated to.
Typically, many image thunbnails are shown in a grid layout.

Blog
A page that shows a blog. It is a routable page that can be navigated to.
The blog page gives an overview about many blog posts. Each blog post is edited as a Article Section and linked from the blog page.
Blog posts can be tagged and filtered by tags.

Content
a list of sections that can be edited by the user.
The page is routable and can be navigated to.
Most of the pages are of type Content. This is the default type of page because it can be easily extended with sections.
e.g. Landing or Home Page = Content Page with Section Hero, Article Section Features, Article Section Testimonials, Hero Section CTA
e.g. Tracker Page = Content Page with Section Map, Section Tracker
other examples that can be solved with Sections: Quiz, Survey, About, Contact, Album, NotFound

Dashboard
A Dashboard page shows a dashboard with a list of configurable widgets.
Users can add, remove and configure widgets.

Shop / Cart
product pages, shopping cart, and checkout process.
For e-commerce websites, the Cart page is a virtual shopping basket. While designing this page, prioritize clarity and ease of use. 
Your visitors should be able to see everything they’ve tossed into their cart at a glance and feel good about heading to checkout. 
Start with a clean, organized list that displays each product with a small thumbnail image, the product title, quantity, and the price per item.

Search Results
The Search Results page functions as a digital catalog, guiding users toward the information they seek. To initiate an easy search, 
it’s crucial to design this page with clarity and efficiency in mind. Relevant results should be displayed prominently, with clear titles, 
snippets, and specific information to help visitors identify the most promising options.
Sorting and filtering options are also valuable tools. They allow users to refine their search based on specific criteria, 
such as date, author, or category. If you are interested in more ways to make your search bar stand out, check out our article, 
“Search Result Page Design — Best Practices.”

*/