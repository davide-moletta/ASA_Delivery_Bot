(define (domain default)

    (:requirements :strips :typing :negative-preconditions)

    (:types
        agent parcel cell
    )

    (:predicates
        (at ?a - agent ?c - cell)
        (in ?p - parcel ?c - cell)
        (holding ?a - agent ?p - parcel)
        (is-delivery ?c - cell)
        (is-blocked ?c - cell)
        (neighbourUp ?c1 - cell ?c2 - cell)
        (neighbourDown ?c1 - cell ?c2 - cell)
        (neighbourLeft ?c1 - cell ?c2 - cell)
        (neighbourRight ?c1 - cell ?c2 - cell)
        (delivered ?p - parcel)
    )

    (:action moveUp
        :parameters (?a - agent ?c1 - cell ?c2 - cell)
        :precondition (and
            (neighbourUp ?c1 ?c2)
            (not (is-blocked ?c2))
            (at ?a ?c1)
        )
        :effect (and
            (at ?a ?c2)
            (not (at ?a ?c1))
        )
    )

    (:action moveDown
        :parameters (?a - agent ?c1 - cell ?c2 - cell)
        :precondition (and
            (neighbourDown ?c1 ?c2)
            (not (is-blocked ?c2))
            (at ?a ?c1)
        )
        :effect (and
            (at ?a ?c2)
            (not (at ?a ?c1))
        )
    )

    (:action moveRight
        :parameters (?a - agent ?c1 - cell ?c2 - cell)
        :precondition (and
            (neighbourRight ?c1 ?c2)
            (not (is-blocked ?c2))
            (at ?a ?c1)
        )
        :effect (and
            (at ?a ?c2)
            (not (at ?a ?c1))
        )
    )

    (:action moveLeft
        :parameters (?a - agent ?c1 - cell ?c2 - cell)
        :precondition (and
            (neighbourLeft ?c1 ?c2)
            (not (is-blocked ?c2))
            (at ?a ?c1)
        )
        :effect (and
            (at ?a ?c2)
            (not (at ?a ?c1))
        )
    )

    (:action pickup
        :parameters (?a - agent ?p - parcel ?c - cell)
        :precondition (and
            (at ?a ?c)
            (in ?p ?c)
            (not (holding ?a ?p))
        )
        :effect (and
            (holding ?a ?p)
            (not (in ?p ?c))
        )
    )

    (:action putdown
        :parameters (?a - agent ?p - parcel ?c - cell)
        :precondition (and
            (at ?a ?c)
            (holding ?a ?p)
            (is-delivery ?c)
        )
        :effect (and
            (not (holding ?a ?p))
            (delivered ?p)
        )
    )
)