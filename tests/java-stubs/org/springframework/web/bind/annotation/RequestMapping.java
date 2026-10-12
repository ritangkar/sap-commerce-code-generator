package org.springframework.web.bind.annotation;

@java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME)
public @interface RequestMapping { String[] value() default {}; RequestMethod[] method() default {}; String[] consumes() default {}; String[] produces() default {}; }
