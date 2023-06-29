(define (domain default)

    (:requirements :strips :typing :negative-preconditions)

    (:types
        a p c me
    )

    (:predicates
        (at ?me - me ?c - c)
        (in ?p - p ?c - c)
        (occ ?a - a ?c - c)

        (is-delivery ?c - c)
        (is-blocked ?c - c)

        (neighbourUp ?c1 - c ?c2 - c)
        (neighbourDown ?c1 - c ?c2 - c)
        (neighbourLeft ?c1 - c ?c2 - c)
        (neighbourRight ?c1 - c ?c2 - c)

        (holding ?me - me ?p - p)
        (delivered ?p - p)
    )

    (:action up
        :parameters (?me - me ?c1 - c ?c2 - c ?a - a)
        :precondition (and
            (neighbourUp ?c1 ?c2)
            (not (is-blocked ?c2))
            (at ?me ?c1)
            (not (occ ?a ?c2))
        )
        :effect (and
            (at ?me ?c2)
            (not (at ?me ?c1))
        )
    )

    (:action down
        :parameters (?me - me ?c1 - c ?c2 - c ?a - a)
        :precondition (and
            (neighbourDown ?c1 ?c2)
            (not (is-blocked ?c2))
            (at ?me ?c1)
            (not (occ ?a ?c2))
        )
        :effect (and
            (at ?me ?c2)
            (not (at ?me ?c1))
        )
    )

    (:action right
        :parameters (?me - me ?c1 - c ?c2 - c ?a - a)
        :precondition (and
            (neighbourRight ?c1 ?c2)
            (not (is-blocked ?c2))
            (at ?me ?c1)
            (not (occ ?a ?c2))
        )
        :effect (and
            (at ?me ?c2)
            (not (at ?me ?c1))
        )
    )

    (:action left
        :parameters (?me - me ?c1 - c ?c2 - c ?a - a)
        :precondition (and
            (neighbourLeft ?c1 ?c2)
            (not (is-blocked ?c2))
            (at ?me ?c1)
            (not (occ ?a ?c2))
        )
        :effect (and
            (at ?me ?c2)
            (not (at ?me ?c1))
        )
    )

    (:action pickup
        :parameters (?me - me ?p - p ?c - c)
        :precondition (and
            (at ?me ?c)
            (in ?p ?c)
            (not (holding ?me ?p))
        )
        :effect (and
            (holding ?me ?p)
            (not (in ?p ?c))
        )
    )

    (:action putdown
        :parameters (?me - me ?p - p ?c - c)
        :precondition (and
            (at ?me ?c)
            (holding ?me ?p)
            (is-delivery ?c)
        )
        :effect (and
            (not (holding ?me ?p))
            (delivered ?p)
        )
    )
)