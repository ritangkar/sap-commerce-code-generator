package org.springframework.web.bind.annotation;

@java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME)
public @interface PatchMapping { String[] value() default {}; String[] path() default {}; String[] consumes() default {}; String[] produces() default {}; }
