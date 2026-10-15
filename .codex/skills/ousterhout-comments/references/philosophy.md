# The comment philosophy in Chapters 12, 13, 15, and 16

This is an original synthesis of John Ousterhout, *A Philosophy of Software Design*, second edition, Yaknyam Press, 2021. It covers every numbered section of the four requested chapters. It paraphrases the guidance and omits extended quotations and the book's example implementations.

The supplied EPUB was inspected directly. Its chapter files are `OEBPS/part0016.xhtml`, `part0017.xhtml`, `part0019.xhtml`, and `part0020.xhtml`. The page ranges below come from its page navigation. Section numbers are the preferred references across formats. This skill is usable without the EPUB.

## Chapter 12: why comments matter

Source: Chapter 12, pages 95-100, sections 12.1-12.6.

### 12.1: code cannot express the entire abstraction

Good names and clear code help, but declarations cannot capture all the information needed to use an abstraction. A signature may leave range boundaries, exceptional cases, valid calling conditions, and result meanings unspecified. Rationale also usually lies outside the code's formal expression.

Making every caller read an implementation transfers complexity to the caller. Splitting code into many small, shallow helpers does not solve this problem when readers must follow those helpers to reconstruct the behavior. Interface comments supply a simplified but sufficient account that allows callers to ignore the implementation. Human language is useful because it can express an intuitive abstraction without enumerating every operational detail.

### 12.2: documentation is a design investment

Perpetually prioritizing the next feature over documentation eventually produces undocumented software. Treat important comments as part of implementing a maintainable system. Their cost must be weighed against repeated future investigation and mistakes. Comments that help establish a sound abstraction can repay their effort during the same design task. The chapter's estimates of typing time are illustrative arguments, rather than comment quotas or measured guarantees.

### 12.3: staleness is a maintenance problem with practical remedies

The risk that comments will become inaccurate calls for maintaining them. It does not justify omitting the information. Keep documentation near the relevant code, avoid copies of the same explanation, and use review to catch mismatches. Large changes may require substantial documentation updates, but they also require substantial implementation work.

### 12.4: unhelpful examples do not make comments inherently unhelpful

Many existing comments have little value. Improve their informational content and placement instead of treating poor examples as evidence that documentation should disappear. A commenting convention alone cannot make redundant text useful.

### 12.5: preserve the designer's otherwise hidden knowledge

Record the knowledge that would otherwise have to be rediscovered or guessed. This includes hardware constraints, subtle dependencies, the purpose of a class, and the reasoning behind a decision. The original author also benefits after forgetting the details.

Comments reduce the amount of information a developer must reconstruct and reveal relevant constraints that a developer might not know to investigate. They clarify dependencies and remove obscurity. The chapter specifically connects documentation to reduced cognitive load and fewer unknown unknowns. Documentation can expose a dependency without removing that dependency or eliminating the work it causes.

### 12.6: comments are a positive part of software design

Ousterhout disagrees with treating every comment as evidence of a failure to express intent in code. Code and comments communicate different kinds of information. Better design can reduce incidental implementation commentary while leaving a real need for contracts, abstractions, and rationale. Replacing explanatory prose with extra methods or unusually long names can increase the burden on readers and callers.

Operational consequence: optimize for understanding and useful abstractions. Neither minimum comment count nor maximum comment count expresses this goal.

## Chapter 13: what useful comments contain

Source: Chapter 13, pages 101-120, sections 13.1-13.9.

The central rule is to document information that is not obvious from the code beside the comment. The comparison is with the nearby declaration or block, rather than everything that could eventually be inferred by tracing the entire program. The reader is someone encountering the code for the first time.

### 13.1: establish conventions and prioritize declarations

Choose a consistent format and a clear expectation about what gets documented. Follow an available documentation extractor's conventions. Otherwise use a suitable established convention from a similar environment. Consistency helps readers recognize documentation and helps authors remember to write it.

The chapter distinguishes interface comments, data-member comments, implementation comments, and comments about decisions spanning modules. Interface and data-member documentation have the highest priority. Its default is a comment for every class, field, and method, with rare exceptions when the declaration leaves nothing useful to add. It does not require a comment for every statement or every local variable. Implementation comments are often unnecessary; cross-module explanations are less frequent but can be essential.

### 13.2: add meaning rather than narrating syntax

A comment is redundant when a person could produce it by translating the neighboring statements or identifier into prose without understanding the design. Stating that a counter increments, a value is returned, or a horizontal scrollbar is created usually adds nothing.

Ask what semantics the declaration leaves unresolved. Explain a specialized term, the contents of a returned collection, a unit, or whether a dimension applies on one or both sides. Rephrasing an identifier with synonyms is insufficient. Different wording is useful only when it contributes a different explanation.

### 13.3: add precision below the declaration's level of detail

Names and types often leave critical details unspecified. Document relevant units, inclusivity of boundaries, null or special values, resource ownership and cleanup, and invariants. Explain what a map's keys and values represent and what the absence of an entry means. Define an offset relative to a specific origin or event instead of using an ambiguous word such as current.

Describe what a variable represents. For a state flag, specify the condition under which it is true and any relevant communication role. A list of assignments scattered across methods forces the reader to reconstruct that meaning and is harder to maintain.

Precision is valuable even if a reader could eventually infer it from every use. It belongs beside the declaration so the reader can avoid that investigation.

### 13.4: add intuition above the implementation's level of detail

Explain the goal or organizing idea of a block in simpler terms than its sequence of conditions and assignments. A high-level explanation gives readers a framework for interpreting the statements and a basis for checking whether they accomplish the intended task.

Useful prompts include what the code is trying to accomplish, which aspect matters most, and the simplest explanation that accounts for the block. Describing the situation that causes execution to reach a branch or method can be especially helpful for unusual paths. Rationale and the conditions that lead here often convey more than a translation of the branch condition.

### 13.5: define the caller's abstraction

Separate interface documentation from implementation explanation. The interface describes what a user needs to know; implementation comments help a maintainer understand how the module fulfills that promise. Requiring callers to learn private mechanics weakens the abstraction.

A class comment explains its capability, what each instance represents, and relevant limitations such as a concurrency restriction. It can include a short usage sketch when the interaction among methods would otherwise be difficult to discover. That sketch need not repeat every individual method's detailed contract.

A method comment starts with caller-visible behavior and supplies precise argument and result meanings. Include argument constraints and relationships, observable side effects, exceptions that may escape, and prerequisites such as initialization order or sorted input. Cover special cases sufficiently for callers to use the method without reading its body.

Choose details by their effect on use. A range query's comparison rule belongs in the interface. Private message encodings and internal index structures usually do not. Concurrency or performance techniques may merit an abstract description when they affect the caller's decisions. A recovery mechanism hidden from callers stays internal; a failure that callers observe needs documentation of its manifestation. A method that advances an asynchronous operation must document that progress obligation, even if its name sounds like a passive readiness query.

### 13.6: explain substantial internal work and surprising choices

Many short methods need only their interface documentation. For a long method, a comment before each major block can explain its purpose and make navigation easier. A complex loop may need a summary of the work represented by one iteration. Straightforward loops do not automatically need one.

Record why surprising code is necessary, especially when an apparently simpler change could restore a bug. A well-targeted issue reference can supply the detailed history. Explain important locals used across a long span when their meaning would otherwise be difficult to retain. Keep variable explanations about meaning and block explanations about intent, rather than line-by-line mechanics.

### 13.7: make shared decisions discoverable

Dependencies between modules are a common source of subtle bugs. Find the place a maintainer will naturally visit when changing the shared concept. An enum declaration can identify companion tables, translations, or bindings that must change when a value is added. Put the explanation where the relevant edit is likely to occur.

When no declaration naturally owns the decision, use a clearly named topic in a central design document and add short references from affected code. The book presents a `designNotes` file as an approach under experimentation, not a required filename or universal solution. A central note avoids conflicting copies but is farther from the code, so changes still require checking it.

### 13.8: judge obviousness from the reader's perspective

The intended outcome is that readers can find the needed information and change code with confidence. Familiarity with one's own implementation is a poor test of clarity. When a reviewer finds something confusing, investigate the missing explanation and improve the code or comments. The reader's confusion is evidence about the documentation, rather than a dispute to win.

### 13.9: apply the caller-needs test to borderline details

The chapter's worked answers reinforce the distinction. Query comparison semantics belong in the contract. Internal network formats, storage structures, and invisible crash recovery do not. Performance characteristics may belong when useful to callers. When a failure crosses the abstraction boundary, document its visible consequences without exposing the recovery algorithm unnecessarily.

## Chapter 15: use comments to design

Source: Chapter 15, pages 131-136, sections 15.1-15.6.

### 15.1: delaying comments loses information

Postponing documentation creates a backlog that is easy to postpone again. By the time authors return to it, their rationale is less fresh and their attention has moved on. Looking only at completed code encourages comments that repeat its mechanics and omit the decisions that produced it.

### 15.2: establish abstractions before implementations

Ousterhout's sequence begins with the class interface comment, followed by the important public method contracts and signatures. Refine the structure, add important field declarations and their comments, and then fill in the method bodies with internal comments where needed. Document newly discovered helpers before their bodies, and new fields with their declarations.

The desired completion condition is that working code arrives with its comments already written and revised during development. The approach preserves design knowledge and focuses interface writing on the abstraction before implementation details dominate attention.

### 15.3: difficulty explaining something is design feedback

A clear, complete interface description helps assess how much complexity the abstraction exposes. A small contract hiding substantial functionality indicates depth. A contract that must explain nearly all the implementation suggests a shallow module. A variable that requires a complicated explanation may reflect a poor decomposition of state.

The warning is difficulty producing an explanation that is both simple and complete. Merely shortening documentation, omitting requirements, or writing cryptically does not improve the design and makes the test invalid.

### 15.4: make comment writing part of the creative work

Writing the explanation during design turns documentation into a way to record and evaluate decisions. Seeking a concise, complete abstraction gives the activity an immediate purpose, instead of leaving it as administrative work after the interesting decisions have been made.

### 15.5: assess the total cost of change

Early documentation may need revision, but avoiding that revision saves only part of the typing effort. Clarifying the abstraction first may reduce implementation changes and total development time. The chapter's rough time estimates motivate experimentation; they are not targets for comment density, word counts, or project budgeting.

### 15.6: practice the approach and evaluate its effects

Try writing comments first long enough to judge how it affects clarity, design, and the experience of development. The recommendation is a working method whose value should become visible in the resulting code and documentation.

## Chapter 16: keep documentation useful as code changes

Source: Chapter 16, pages 137-142, sections 16.1-16.6.

### 16.1: preserve design quality during evolution

Repeated quick patches can accumulate special cases and dependencies. Consider the design the system would have if the new requirement had been present from the beginning, and work toward that structure within actual time and compatibility constraints. Sometimes a full redesign is impractical; seek the best improvement feasible under those constraints.

For this skill, this is a diagnostic principle, not permission for unrelated refactoring. A comment task can reveal an incoherent contract, but code changes remain subject to the user's scope. Explain unresolved design problems rather than making confusing behavior appear sound through prose.

### 16.2: keep each explanation near its subject

Place comments where maintainers will encounter them while changing the relevant code. Ousterhout prefers a method's interface documentation by its definition, even in languages with separate header declarations, because maintainers are more likely to update it there. He expects documentation extractors and IDEs to serve callers. Applying this preference must account for the repository's established extractor and placement convention.

Put implementation details at the narrowest scope covering the relevant code. A method-wide strategy overview can coexist with local phase explanations, but detailed descriptions of later phases belong near those phases. The farther documentation is from the code, the more abstract it should generally be.

### 16.3: put lasting rationale where future edits happen

A commit message alone is unlikely to be discovered when someone revisits the code. Preserve information future maintainers need in source comments, especially the subtle reason for a bug fix. A commit message may also contain that explanation, but it does not substitute for discoverable documentation.

### 16.4: maintain one authoritative explanation

Document a decision once at a natural declaration or other discoverable home. Use short references where the decision matters elsewhere. If a reference breaks, the missing target is detectable; conflicting copied explanations can look trustworthy while becoming stale.

Avoid restating a called module's contract at every call site. A class usage sketch may explain collaboration among methods, but the detailed contract belongs to its owner. Reference an authoritative external specification or user manual instead of embedding a duplicate. Include enough local context to identify the relevant material and preserve this program's specific behavior and differences.

### 16.5: review changes together with their documentation

Before committing, inspect the actual diff and check that implementation changes are reflected in every affected explanation. This includes documentation in a different file or a central design note. The same pass can reveal leftover debugging code and unfinished work.

### 16.6: abstraction improves durability

Comments about overall behavior or intent usually survive small implementation edits. This supports the same information choice that makes comments useful in the first place. Precise details remain necessary where they define semantics; abstract wording should never erase units, ownership, boundaries, or caller obligations.

## Operational adaptations in the skill

The book supplies the philosophy above. The skill adds procedures for an agent working in a real repository: verify assertions against evidence, preserve executable behavior during comment-only work, retain machine-consumed directives and legal text, respect the requested edit scope, follow project documentation conventions, and report uncertainty. These are application safeguards, rather than additional claims attributed to the author.
